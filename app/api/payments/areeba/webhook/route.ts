import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { releaseOrderReservations } from '@/lib/inventory'
import { areebaMpgsPaymentProvider, areebaWebhookToken, safeTokenEqual } from '@/lib/payments'

async function processPaymentNotification(orderNumber: string) {
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, grandTotal: true, currency: true, paymentStatus: true } })
  if (!order) return false
  const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs' }, orderBy: { createdAt: 'desc' } })
  if (!transaction?.externalId || transaction.amount !== order.grandTotal || transaction.currency !== order.currency) return false
  const status = await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId, orderNumber)
  if (status === 'paid') {
    await db.$transaction(async tx => {
      const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } })
      if (current?.paymentStatus !== 'PAID') await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
      await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'paid' } })
    })
    await audit(null, 'payment.paid', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber, source: 'webhook' })
  } else if (status === 'failed') {
    let transitioned = false
    await db.$transaction(async tx => {
      const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true, couponCode: true } })
      if (!current || current.paymentStatus === 'PAID') return
      await releaseOrderReservations(tx, order.id, 'Online payment failed')
      if (current.couponCode) await tx.coupon.updateMany({ where: { code: current.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'CANCELLED', events: { create: { status: 'CANCELLED', message: 'Online payment failed.' } } } })
      await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'failed' } })
      transitioned = true
    })
    if (transitioned) await audit(null, 'payment.failed', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber, source: 'webhook' })
  }
  return true
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    if (!safeTokenEqual(url.searchParams.get('token')?.trim() || '', areebaWebhookToken())) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, any>
    const orderNumber = typeof body.order?.id === 'string' ? body.order.id.trim() : typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderNumber) return Response.json({ error: 'order.id is required' }, { status: 400 })
    await processPaymentNotification(orderNumber)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 200 })
  }
}
