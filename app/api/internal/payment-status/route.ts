import { db } from '@/lib/prisma'
import { canTransitionPayment } from '@/lib/orders'
import { PaymentStatus } from '@prisma/client'

export async function POST(req: Request) {
  const configured = process.env.PAYMENT_WEBHOOK_SECRET
  if (!configured || req.headers.get('authorization') !== `Bearer ${configured}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const externalId = typeof body.externalId === 'string' ? body.externalId.trim().slice(0, 190) : ''
    const status = body.status as PaymentStatus

    if (!orderId || !externalId || !Object.values(PaymentStatus).includes(status)) {
      return Response.json({ error: 'orderId, externalId and a valid payment status are required' }, { status: 400 })
    }

    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new Error('Order not found')

      const existing = await tx.paymentTransaction.findFirst({ where: { externalId, orderId: order.id } })
      if (existing) return { orderId, paymentStatus: order.paymentStatus, duplicate: true }

      const reused = await tx.paymentTransaction.findFirst({ where: { externalId } })
      if (reused) throw new Error('Payment externalId is already associated with another order')

      if (order.paymentStatus === status) return { orderId, paymentStatus: order.paymentStatus, ignored: true }
      if (!canTransitionPayment(order.paymentStatus, status)) {
        throw new Error(`Invalid payment transition: ${order.paymentStatus} → ${status}`)
      }

      const priorRefunded = await tx.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: { orderId: order.id, status: { in: ['refunded', 'partially_refunded'] } },
      })
      const refundedSoFar = Math.max(0, priorRefunded._sum.amount || 0)
      const remainingRefundable = Math.max(0, order.grandTotal - refundedSoFar)
      const amount = Number.isInteger(body.amount) ? Number(body.amount) : order.grandTotal
      if (amount <= 0) throw new Error('Payment amount must be positive')

      if (status === PaymentStatus.PAID && amount !== order.grandTotal) {
        throw new Error('Payment amount does not match order total')
      }
      if (status === PaymentStatus.PARTIALLY_REFUNDED) {
        if (order.paymentStatus !== PaymentStatus.PAID || amount >= remainingRefundable) {
          throw new Error('Invalid partial refund amount')
        }
      }
      if (status === PaymentStatus.REFUNDED && amount !== remainingRefundable) {
        throw new Error('Final refund amount must equal the remaining refundable balance')
      }

      const transactionStatus = status === PaymentStatus.PARTIALLY_REFUNDED ? 'partially_refunded' : status.toLowerCase()
      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus: status } })
      await tx.paymentTransaction.create({ data: {
        orderId: order.id,
        provider: typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim().slice(0, 80) : 'external',
        externalId,
        status: transactionStatus,
        amount,
        currency: order.currency,
        rawJson: JSON.stringify(body).slice(0, 20000),
      } })
      return { orderId: updated.id, paymentStatus: updated.paymentStatus }
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update payment status'
    const status = message === 'Order not found' ? 404 : message.startsWith('Payment externalId') ? 409 : message.startsWith('Invalid payment transition') ? 409 : 400
    return Response.json({ error: message }, { status })
  }
}
