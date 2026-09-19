import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { canCustomerCancel } from '@/lib/orders'
import { releaseOrderReservations } from '@/lib/inventory'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
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

      const order = await tx.order.findUnique({ where: { id: existing.id }, include: { paymentTransactions: { select: { provider: true, rawJson: true } } } })
      if (!order || order.userId !== user.id) throw new Error('Order not found')
      if (!canCustomerCancel(order.status)) throw new Error('This order can no longer be cancelled online')
      if (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED') throw new Error('Paid orders cannot be cancelled online; use the refund workflow')

      await releaseOrderReservations(tx, order.id, 'Customer cancelled order')

      const coinsUsed = redeemedCoins(order.paymentTransactions)
      if (coinsUsed > 0) {
        const reversalId = `coin_${user.id}_${order.orderNumber}_reversal`
        await tx.coinTransaction.upsert({
          where: { id: reversalId },
          create: {
            id: reversalId,
            userId: user.id,
            amount: coinsUsed,
            type: 'REVERSAL',
            reason: 'Cancelled order coin restoration',
            referenceId: `coin-reversal:${order.orderNumber}`,
          },
          update: {},
        })
      }

      const redeemed = redeemedGiftCard(order.paymentTransactions)
      if (redeemed) await restoreGiftCardBalance(tx, order.id, redeemed)

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
