import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { releaseOrderReservations } from '@/lib/inventory'
import { areebaMpgsPaymentProvider, areebaWebhookToken, safeTokenEqual } from '@/lib/payments'

async function reconcileRefunds(orderId: string, body: Record<string, any>) {
  const gatewayStatus = String(body.order?.status || '').toUpperCase()
  const gatewayRefunded = Number(body.order?.totalRefundedAmount)
  if (!Number.isFinite(gatewayRefunded) || !['REFUNDED', 'PARTIALLY_REFUNDED', 'EXCESSIVELY_REFUNDED'].includes(gatewayStatus)) return false
  const gatewayRefundedMinor = Math.round(gatewayRefunded * 100)
  let reconciled = false
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { paymentTransactions: true } })
    if (!order) return
    const pending = order.paymentTransactions.filter(t => t.status === 'refund_pending')
    if (!pending.length) return
    const alreadyRefunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
    const pendingAmount = pending.reduce((sum, t) => sum + t.amount, 0)
    if (gatewayRefundedMinor < alreadyRefunded + pendingAmount) return
    for (const transaction of pending) await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'refunded' } })
    const paymentStatus = gatewayRefundedMinor >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    const status = paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status, events: { create: { status, message: `Gateway refund confirmed (${gatewayRefundedMinor} ${order.currency}).` } } } })
    reconciled = true
  })
  if (reconciled) await audit(null, 'order.refund_reconciled', 'Order', orderId, { provider: 'areeba_mpgs', gatewayStatus, gatewayRefunded })
  return reconciled
}

async function processPaymentNotification(orderNumber: string, body: Record<string, any>) {
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, grandTotal: true, currency: true, paymentStatus: true } })
  if (!order) return false
  if (await reconcileRefunds(order.id, body)) return true
  if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) return true

  const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs', status: { in: ['pending', 'paid', 'failed'] } }, orderBy: { createdAt: 'desc' } })
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
      if (!current || current.paymentStatus === 'PAID' || ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(current.paymentStatus)) return
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
    const processed = await processPaymentNotification(orderNumber, body)
    if (!processed) return Response.json({ error: 'Payment notification could not be reconciled' }, { status: 409 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Webhook processing failed; retry required' }, { status: 500 })
  }
}
