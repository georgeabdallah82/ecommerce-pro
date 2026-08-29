import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { canCustomerCancel } from '@/lib/orders'
import { releaseOrderReservations } from '@/lib/inventory'
import { json } from '@/lib/utils'

const CUSTOMER_CANCEL_MESSAGES = new Set([
  'Order not found',
  'This order can no longer be cancelled online',
  'Paid orders cannot be cancelled online; use the refund workflow',
])

function cancelFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHORIZED') return { status: 401, error: 'Unauthorized' }
  if (CUSTOMER_CANCEL_MESSAGES.has(message)) return { status: message === 'Order not found' ? 404 : 400, error: message }
  console.error('[account/orders/cancel] unexpected failure', error)
  return { status: 500, error: 'Unable to cancel order right now' }
}

function redeemedCoins(paymentTransactions: Array<{ provider: string; rawJson: string | null }>) {
  const checkout = paymentTransactions.find(t => t.provider === 'checkout' && t.rawJson)
  if (!checkout?.rawJson) return 0
  try {
    const parsed = JSON.parse(checkout.rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

export async function POST(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    const user = await requireUser()
    const { orderNumber } = await params
    const result = await db.$transaction(async tx => {
      const existing = await tx.order.findFirst({ where: { orderNumber, userId: user.id }, select: { id: true } })
      if (!existing) throw new Error('Order not found')

      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${existing.id} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: existing.id }, include: { paymentTransactions: { select: { provider: true, rawJson: true } } } })
      if (!order || order.userId !== user.id) throw new Error('Order not found')
      if (!canCustomerCancel(order.status)) throw new Error('This order can no longer be cancelled online')
      if (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED') throw new Error('Paid orders cannot be cancelled online; use the refund workflow')

      await releaseOrderReservations(tx, order.id, 'Customer cancelled order')

      const coinsUsed = redeemedCoins(order.paymentTransactions)
      if (coinsUsed > 0) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coins:${user.id}`}))`
        const reversalReference = `coin-reversal:${order.orderNumber}`
        const alreadyReversed = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "CoinTransaction"
          WHERE "userId" = ${user.id} AND "referenceId" = ${reversalReference} AND "type" = 'REVERSAL'
          LIMIT 1
        `
        if (!alreadyReversed[0]) {
          await tx.$executeRaw`
            INSERT INTO "CoinTransaction" ("id", "userId", "amount", "type", "reason", "referenceId")
            VALUES (${`coin_${crypto.randomUUID()}`}, ${user.id}, ${coinsUsed}, 'REVERSAL', 'Cancelled order coin restoration', ${reversalReference})
          `
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'UNFULFILLED',
          paymentStatus: order.paymentStatus,
          events: { create: { status: 'CANCELLED', message: 'Order cancelled by customer.' } },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          grandTotal: true,
          currency: true,
        },
      })

      return { updated, userId: order.userId }
    })

    if (result.userId) {
      try {
        await db.notification.create({
          data: {
            userId: result.userId,
            title: `Order ${result.updated.orderNumber} cancelled`,
            body: 'Your order was cancelled and its inventory reservation was released.',
            type: 'ORDER_STATUS',
          },
        })
      } catch (error) {
        console.error('[account/orders/cancel] notification failed', error)
      }
    }

    return json({ order: result.updated }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = cancelFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
