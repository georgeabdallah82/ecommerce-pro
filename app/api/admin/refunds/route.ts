import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { getPaymentProvider } from '@/lib/payments'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { randomUUID } from 'crypto'

const REFUND_MESSAGES = new Set([
  'Order not found',
  'Cancelled orders cannot be refunded',
  'Only paid orders can be refunded',
  'A refund is already in progress for this order',
  'Order is already fully refunded',
  'Paid gateway transaction is missing its external reference',
])

function refundFailure(error: unknown) {
  if (error instanceof Error && (REFUND_MESSAGES.has(error.message) || error.message.startsWith('Refund cannot exceed the remaining refundable amount of '))) {
    return { message: error.message, status: error.message === 'Order not found' ? 404 : 400 }
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return { message: 'Unauthorized', status: 401 }
  if (error instanceof Error && error.message === 'FORBIDDEN') return { message: 'Forbidden', status: 403 }
  console.error('[admin/refunds] unexpected failure', error)
  return { message: 'Unable to process the refund right now.', status: 500 }
}

function parseCoinsUsed(rawJson: string | null) {
  if (!rawJson) return 0
  try {
    const parsed = JSON.parse(rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.refund')
    const body = await req.json()
    const orderId = String(body.orderId || '').trim()
    const requestedAmount = Number(body.amount)
    if (!orderId || !Number.isInteger(requestedAmount) || requestedAmount <= 0) return json({ error: 'A valid orderId and positive integer refund amount are required' }, { status: 400 })

    const prepared = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { paymentTransactions: true } })
      if (!order) throw new Error('Order not found')
      if (order.status === 'CANCELLED') throw new Error('Cancelled orders cannot be refunded')
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) throw new Error('Only paid orders can be refunded')

      const pendingRefunds = order.paymentTransactions.filter(t => t.status === 'refund_pending')
      if (pendingRefunds.length) throw new Error('A refund is already in progress for this order')

      const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
      const remaining = Math.max(0, order.grandTotal - refunded)
      if (remaining <= 0) throw new Error('Order is already fully refunded')
      if (requestedAmount > remaining) throw new Error(`Refund cannot exceed the remaining refundable amount of ${remaining}`)

      const original = order.paymentTransactions.filter(t => t.provider !== 'manual' && ['paid', 'captured', 'authorized'].includes(t.status) && t.externalId).sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      const provider = order.paymentMethod === 'WALLET' ? 'wallet' : (original?.provider || 'manual')
      if (provider !== 'manual' && provider !== 'wallet' && !original?.externalId) throw new Error('Paid gateway transaction is missing its external reference')

      const transaction = await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          provider,
          externalId: original?.externalId || null,
          status: provider === 'manual' || provider === 'wallet' ? 'refunded' : 'refund_pending',
          amount: requestedAmount,
          currency: order.currency,
          rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id }),
        },
      })
      return { order, transaction, provider, externalId: original?.externalId || null }
    })

    if (prepared.provider !== 'manual' && prepared.provider !== 'wallet') {
      try {
        const provider = await getPaymentProvider(prepared.provider)
        if (provider.name !== prepared.provider || !provider.refundPayment || !prepared.externalId) throw new Error(`Payment provider ${prepared.provider} is not available for refunds`)
        const refundResult = await provider.refundPayment(prepared.externalId, requestedAmount, prepared.order.currency)
        if (refundResult === 'pending') {
          await db.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refund_pending', rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id, gatewayStatus: 'PENDING' }) } })
          await audit(actor.id, 'order.refund_pending', 'Order', prepared.order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider })
          return json({ order: prepared.order, refund: { ...prepared.transaction, status: 'refund_pending' }, refundedTotal: null, status: 'pending' }, { status: 202 })
        }
      } catch (error) {
        await db.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refund_failed', rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id, error: error instanceof Error ? error.message : 'Gateway refund failed' }).slice(0, 5000) } })
        await audit(actor.id, 'order.refund_failed', 'Order', prepared.order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider })
        throw error
      }
    }

    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${prepared.order.id} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: prepared.order.id }, include: { paymentTransactions: true } })
      if (!order) throw new Error('Order not found')

      await tx.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refunded' } })
      const successfulRefunds = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status) && t.id !== prepared.transaction.id).reduce((sum, t) => sum + t.amount, 0) + requestedAmount
      const paymentStatus = successfulRefunds >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      const status = paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status

      if (prepared.provider === 'wallet' && order.userId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${order.userId}:${order.currency}`}))`
        const duplicateWalletRefund = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "WalletTransaction"
          WHERE "userId" = ${order.userId}
            AND "referenceId" = ${`wallet-refund:${prepared.transaction.id}`}
            AND "type" = 'REFUND'
          LIMIT 1
        `
        if (!duplicateWalletRefund[0]) {
          await tx.$executeRaw`
            INSERT INTO "WalletTransaction" ("id", "userId", "amount", "currency", "type", "reason", "referenceId")
            VALUES (${`wal_${randomUUID()}`}, ${order.userId}, ${requestedAmount}, ${order.currency}, 'REFUND', 'Order refund credited to wallet', ${`wallet-refund:${prepared.transaction.id}`})
          `
        }
      }

      const checkoutTx = order.paymentTransactions.find(t => t.provider === 'checkout' && t.rawJson)
      const coinsUsed = parseCoinsUsed(checkoutTx?.rawJson || null)
      if (order.userId && coinsUsed > 0 && order.grandTotal > 0) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coins:${order.userId}`}))`
        const restoredRows = await tx.$queryRaw<Array<{ amount: number }>>`
          SELECT COALESCE(SUM("amount"),0)::int AS amount
          FROM "CoinTransaction"
          WHERE "userId" = ${order.userId}
            AND "type" = 'REFUND'
            AND "referenceId" LIKE ${`coin-refund:${order.id}:%`}
        `
        const restored = Math.max(0, Number(restoredRows[0]?.amount || 0))
        const target = Math.min(coinsUsed, Math.floor(coinsUsed * successfulRefunds / order.grandTotal))
        const delta = target - restored
        if (delta > 0) {
          await tx.$executeRaw`
            INSERT INTO "CoinTransaction" ("id", "userId", "amount", "type", "reason", "referenceId")
            VALUES (${`coin_${randomUUID()}`}, ${order.userId}, ${delta}, 'REFUND', 'Order refund coin restoration', ${`coin-refund:${order.id}:${prepared.transaction.id}`})
          `
        }
      }

      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status, events: { create: { status, message: paymentStatus === 'REFUNDED' ? `Order fully refunded (${requestedAmount} ${order.currency}).` : `Order partially refunded (${requestedAmount} ${order.currency}).` } } } })
      await audit(actor.id, 'order.refunded', 'Order', order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider, refundedTotal: successfulRefunds })
      return { order: updated, transaction: { ...prepared.transaction, status: 'refunded' }, refundedTotal: successfulRefunds }
    })

    if (result.order.userId) {
      try {
        await db.notification.create({
          data: {
            userId: result.order.userId,
            title: `Refund for ${result.order.orderNumber}`,
            body: `A refund of ${requestedAmount} ${result.order.currency} was processed.`,
            type: 'ORDER_REFUND',
          },
        })
      } catch {
        // Notifications are best-effort and must not turn a committed refund into a failure.
      }
    }
    return json({ order: result.order, refund: result.transaction, refundedTotal: result.refundedTotal }, { status: 201 })
  } catch (e) {
    const failure = refundFailure(e)
    return json({ error: failure.message }, { status: failure.status })
  }
}
