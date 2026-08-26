import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.refund')
    const body = await req.json()
    const orderId = String(body.orderId || '').trim()
    const requestedAmount = Number(body.amount)
    if (!orderId || !Number.isInteger(requestedAmount) || requestedAmount <= 0) return json({ error: 'A valid orderId and positive integer refund amount are required' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`

      const order = await tx.order.findUnique({ where: { id: orderId }, include: { paymentTransactions: true } })
      if (!order) throw new Error('Order not found')
      if (order.status === 'CANCELLED') throw new Error('Cancelled orders cannot be refunded')
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) throw new Error('Only paid orders can be refunded')

      const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
      const remaining = Math.max(0, order.grandTotal - refunded)
      if (remaining <= 0) throw new Error('Order is already fully refunded')
      if (requestedAmount > remaining) throw new Error(`Refund cannot exceed the remaining refundable amount of ${remaining}`)

      const transaction = await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          provider: 'manual',
          status: 'refunded',
          amount: requestedAmount,
          currency: order.currency,
          rawJson: JSON.stringify({ reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id }).slice(0, 5000),
        },
      })
      const newRefundedTotal = refunded + requestedAmount
      const paymentStatus = newRefundedTotal >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      const status = paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status
      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status, events: { create: { status, message: paymentStatus === 'REFUNDED' ? `Order fully refunded (${requestedAmount} ${order.currency}).` : `Order partially refunded (${requestedAmount} ${order.currency}).` } } } })

      // Keep the audit record in the same transaction as the refund so a post-commit
      // audit failure cannot make a successful refund look like a failed request.
      await tx.auditLog.create({ data: {
        actorId: actor.id,
        action: 'order.refunded',
        entity: 'Order',
        entityId: order.id,
        metadataJson: JSON.stringify({ amount: requestedAmount, transactionId: transaction.id, refundedTotal: newRefundedTotal }),
      } })

      return { order: updated, transaction, refundedTotal: newRefundedTotal }
    })

    // Notifications are intentionally best-effort after the financial transaction
    // commits. A notification outage must never cause an already-applied refund to
    // be returned to the caller as a failed operation and retried.
    if (result.order.userId) {
      try {
        await db.notification.create({ data: { userId: result.order.userId, title: `Refund for ${result.order.orderNumber}`, body: `A refund of ${requestedAmount} ${result.order.currency} was recorded.`, type: 'ORDER_REFUND' } })
      } catch {
        // Do not roll back or re-report a committed financial operation.
      }
    }

    return json({ order: result.order, refund: result.transaction, refundedTotal: result.refundedTotal }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to refund order'
    return json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message === 'Order not found' ? 404 : 400 })
  }
}
