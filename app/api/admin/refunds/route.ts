import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { getPaymentProvider } from '@/lib/payments'
import { json } from '@/lib/utils'

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
      const provider = original?.provider || 'manual'
      if (provider !== 'manual' && !original?.externalId) throw new Error('Paid gateway transaction is missing its external reference')

      const transaction = await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          provider,
          externalId: original?.externalId || null,
          status: provider === 'manual' ? 'refunded' : 'refund_pending',
          amount: requestedAmount,
          currency: order.currency,
          rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id }),
        },
      })
      return { order, transaction, provider, externalId: original?.externalId || null }
    })

    if (prepared.provider !== 'manual') {
      try {
        const provider = await getPaymentProvider(prepared.provider)
        if (provider.name !== prepared.provider || !provider.refundPayment || !prepared.externalId) throw new Error(`Payment provider ${prepared.provider} is not available for refunds`)
        const refundResult = await provider.refundPayment(prepared.externalId, requestedAmount, prepared.order.currency)
        if (refundResult === 'pending') {
          await db.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refund_pending', rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id, gatewayStatus: 'PENDING' }) } })
          await db.auditLog.create({ data: { actorId: actor.id, action: 'order.refund_pending', entity: 'Order', entityId: prepared.order.id, metadataJson: JSON.stringify({ amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider }) } })
          return json({ order: prepared.order, refund: { ...prepared.transaction, status: 'refund_pending' }, refundedTotal: null, status: 'pending' }, { status: 202 })
        }
      } catch (error) {
        await db.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refund_failed', rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id, error: error instanceof Error ? error.message : 'Gateway refund failed' }).slice(0, 5000) } })
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
      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status, events: { create: { status, message: paymentStatus === 'REFUNDED' ? `Order fully refunded (${requestedAmount} ${order.currency}).` : `Order partially refunded (${requestedAmount} ${order.currency}).` } } } })
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'order.refunded', entity: 'Order', entityId: order.id, metadataJson: JSON.stringify({ amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider, refundedTotal: successfulRefunds }) } })
      return { order: updated, transaction: { ...prepared.transaction, status: 'refunded' }, refundedTotal: successfulRefunds }
    })

    if (result.order.userId) {
      try { await db.notification.create({ data: { userId: result.order.userId, title: `Refund for ${result.order.orderNumber}`, body: `A refund of ${requestedAmount} ${result.order.currency} was processed.`, type: 'ORDER_REFUND' }) } catch {}
    }
    return json({ order: result.order, refund: result.transaction, refundedTotal: result.refundedTotal }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to refund order'
    return json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message === 'Order not found' ? 404 : 400 })
  }
}
