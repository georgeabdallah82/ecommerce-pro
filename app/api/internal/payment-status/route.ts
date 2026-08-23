import { db } from '@/lib/prisma'
import { PaymentStatus } from '@prisma/client'

const rank: Record<PaymentStatus, number> = {
  UNPAID: 0,
  PENDING: 1,
  FAILED: 2,
  PAID: 3,
  PARTIALLY_REFUNDED: 4,
  REFUNDED: 5,
}

export async function POST(req: Request) {
  const configured = process.env.PAYMENT_WEBHOOK_SECRET
  if (!configured || req.headers.get('authorization') !== `Bearer ${configured}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    const externalId = typeof body.externalId === 'string' ? body.externalId.slice(0, 190) : null
    const status = body.status as PaymentStatus
    if (!orderId || !Object.values(PaymentStatus).includes(status)) return Response.json({ error: 'orderId and a valid payment status are required' }, { status: 400 })

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

    if (externalId) {
      const existing = await db.paymentTransaction.findFirst({ where: { orderId, externalId } })
      if (existing) return Response.json({ orderId, paymentStatus: order.paymentStatus, duplicate: true })
    }

    const amount = Number.isInteger(body.amount) ? body.amount : order.grandTotal
    if (status === PaymentStatus.PAID && amount !== order.grandTotal) return Response.json({ error: 'Payment amount does not match order total' }, { status: 409 })
    if (rank[status] < rank[order.paymentStatus] && ![PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED].includes(status)) {
      return Response.json({ orderId, paymentStatus: order.paymentStatus, ignored: true })
    }

    const updated = await db.$transaction(async tx => {
      await tx.paymentTransaction.create({ data: {
        orderId: order.id,
        provider: typeof body.provider === 'string' ? body.provider.slice(0, 80) : 'external',
        externalId,
        status: status.toLowerCase(),
        amount,
        currency: order.currency,
        rawJson: JSON.stringify(body).slice(0, 20000),
      } })
      return tx.order.update({ where: { id: order.id }, data: { paymentStatus: status } })
    })

    return Response.json({ orderId: updated.id, paymentStatus: updated.paymentStatus })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to update payment status' }, { status: 400 })
  }
}
