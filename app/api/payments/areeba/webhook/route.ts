import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { areebaMpgsPaymentProvider, areebaWebhookSecret, areebaWebhookToken, webhookCallerFor } from '@/lib/payments'
import { reconcileGatewayRefunds } from '@/lib/refund-reconciliation'
import { markOnlinePaymentFailed, markOnlinePaymentPaid } from '@/lib/payment-outcome'

async function processPaymentNotification(orderNumber: string) {
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, grandTotal: true, currency: true, paymentStatus: true } })
  if (!order) return false
  if (await reconcileGatewayRefunds(order.id, order.orderNumber)) return true
  if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) return true

  const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs', status: { in: ['pending', 'paid', 'failed'] } }, orderBy: { createdAt: 'desc' } })
  // A record can exist before its gateway session id is saved (lib/invoice-payment.ts saves the record first). The
  // gateway order, looked up by the order number, is what decides, so the session id is not needed here.
  if (!transaction || transaction.amount !== order.grandTotal || transaction.currency !== order.currency) return false
  const status = await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId ?? '', orderNumber)
  if (status === 'paid') await markOnlinePaymentPaid(order, transaction.id, 'webhook')
  else if (status === 'failed') await markOnlinePaymentFailed(order, transaction.id, 'webhook')
  return true
}

export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`areeba-webhook:${clientIp(req.headers)}`, 60, 60 * 1000)
    if (!limit.allowed) return Response.json({ error: 'Too many webhook requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    const url = new URL(req.url)
    // The gateway's X-Notification-Secret header, or the token in the URL of an order placed before the switch (lib/payments.ts).
    const caller = webhookCallerFor({ header: req.headers.get('x-notification-secret'), urlToken: url.searchParams.get('token'), secret: areebaWebhookSecret(), expectedUrlToken: areebaWebhookToken() })
    if (!caller) {
      console.warn('[areeba-webhook] refused a notification: neither the secret header nor the URL token matched')
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    console.info(caller === 'header' ? '[areeba-webhook] notification accepted by the secret header' : '[areeba-webhook] notification accepted by the legacy URL token')
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > 128 * 1024) return Response.json({ error: 'Webhook payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
    const rawBody = await req.text()
    if (rawBody.length > 128 * 1024) return Response.json({ error: 'Webhook payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
    const body = (() => { try { return JSON.parse(rawBody) } catch { return {} } })() as Record<string, any>
    const orderNumber = typeof body.order?.id === 'string' ? body.order.id.trim() : typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderNumber || orderNumber.length > 100) return Response.json({ error: 'Invalid payment notification' }, { status: 400 })
    const processed = await processPaymentNotification(orderNumber)
    if (!processed) return Response.json({ error: 'Payment notification could not be reconciled' }, { status: 409 })
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Webhook processing failed; retry required' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
