import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
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

      const refunded = order.paymentTransactions.filter(t => t.status === 'refunded').reduce((sum, t) => sum + t.amount, 0)
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
      return { order: updated, transaction, refundedTotal: newRefundedTotal }
    })

    if (result.order.userId) await db.notification.create({ data: { userId: result.order.userId, title: `Refund for ${result.order.orderNumber}`, body: `A refund of ${requestedAmount} ${result.order.currency} was recorded.`, type: 'ORDER_REFUND' } })
    await audit(actor.id, 'order.refunded', 'Order', orderId, { amount: requestedAmount, transactionId: result.transaction.id, refundedTotal: result.refundedTotal })
    return json({ order: result.order, refund: result.transaction, refundedTotal: result.refundedTotal }, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to refund order' }, { status: 400 })
  }
}
