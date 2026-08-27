import { db } from '@/lib/prisma'
import { areebaMpgsPaymentProvider } from '@/lib/payments'

async function process(orderNumber: string) {
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, grandTotal: true, currency: true } })
  if (!order) return false
  const status = await areebaMpgsPaymentProvider.getPaymentStatus!(orderNumber, orderNumber)
  if (status === 'paid') {
    await db.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
    await db.paymentTransaction.updateMany({ where: { orderId: order.id, provider: 'areeba_mpgs' }, data: { status: 'paid', amount: order.grandTotal, currency: order.currency } })
  } else if (status === 'failed') {
    await db.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } })
    await db.paymentTransaction.updateMany({ where: { orderId: order.id, provider: 'areeba_mpgs' }, data: { status: 'failed' } })
  }
  return true
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>
    const orderNumber = typeof body.order?.id === 'string' ? body.order.id.trim() : typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderNumber) return Response.json({ error: 'order.id is required' }, { status: 400 })
    await process(orderNumber)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 200 })
  }
}
