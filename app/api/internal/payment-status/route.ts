import { db } from '@/lib/prisma'
import { canTransitionPayment } from '@/lib/orders'
import { PaymentStatus } from '@prisma/client'

export async function POST(req: Request) {
  const configured = process.env.PAYMENT_WEBHOOK_SECRET
  if (!configured || req.headers.get('authorization') !== `Bearer ${configured}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    const externalId = typeof body.externalId === 'string' ? body.externalId.slice(0, 190) : null
    const status = body.status as PaymentStatus
    if (!orderId || !Object.values(PaymentStatus).includes(status)) return Response.json({ error: 'orderId and a valid payment status are required' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new Error('Order not found')

      if (externalId) {
        const existing = await tx.paymentTransaction.findFirst({ where: { orderId, externalId } })
        if (existing) return { orderId, paymentStatus: order.paymentStatus, duplicate: true }
      }

      if (!canTransitionPayment(order.paymentStatus, status)) return { orderId, paymentStatus: order.paymentStatus, ignored: true }

      const amount = Number.isInteger(body.amount) ? body.amount : order.grandTotal
      if (amount <= 0) throw new Error('Payment amount must be positive')
      if (status === PaymentStatus.PAID && amount !== order.grandTotal) throw new Error('Payment amount does not match order total')
      if (status === PaymentStatus.PARTIALLY_REFUNDED && amount >= order.grandTotal) throw new Error('Partial refund amount must be below the order total')

      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus: status } })
      await tx.paymentTransaction.create({ data: {
        orderId: order.id,
        provider: typeof body.provider === 'string' ? body.provider.slice(0, 80) : 'external',
        externalId,
        status: status.toLowerCase(),
        amount,
        currency: order.currency,
        rawJson: JSON.stringify(body).slice(0, 20000),
      } })
      return { orderId: updated.id, paymentStatus: updated.paymentStatus }
    })

    return Response.json(result)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to update payment status' }, { status: 400 })
  }
}
