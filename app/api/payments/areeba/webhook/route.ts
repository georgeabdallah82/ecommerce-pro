import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { releaseOrderReservations } from '@/lib/inventory'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { areebaMpgsPaymentProvider, areebaWebhookToken, safeTokenEqual } from '@/lib/payments'
import { sendOrderConfirmationEmail } from '@/lib/email'

function parseCoinsUsed(rawJson: string | null) {
  if (!rawJson) return 0
  try {
    const parsed = JSON.parse(rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

async function restoreCoinsForOrder(tx: any, order: { id: string; orderNumber: string; grandTotal: number; userId: string | null }, successfulRefundedMinor: number, referenceSuffix: string) {
  if (!order.userId || order.grandTotal <= 0) return 0
  const checkoutTx = await tx.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'checkout' }, orderBy: { createdAt: 'asc' }, select: { rawJson: true } })
  const coinsUsed = parseCoinsUsed(checkoutTx?.rawJson || null)
  if (!coinsUsed) return 0
  const prefix = `coin-refund:${order.id}:`
  const alreadyRestoredAggregate = await tx.coinTransaction.aggregate({ where: { userId: order.userId, type: 'REFUND', referenceId: { startsWith: prefix } }, _sum: { amount: true } })
  const alreadyRestored = Math.max(0, Number(alreadyRestoredAggregate._sum.amount || 0))
  const targetRestored = Math.min(coinsUsed, Math.floor(coinsUsed * Math.max(0, Math.min(successfulRefundedMinor, order.grandTotal)) / order.grandTotal))
  const delta = targetRestored - alreadyRestored
  if (delta <= 0) return 0
  await tx.coinTransaction.create({ data: { id: `coin_refund_${order.id}_${referenceSuffix}`, userId: order.userId, amount: delta, type: 'REFUND', reason: 'Order refund coin restoration', referenceId: `${prefix}${referenceSuffix}` } })
  return delta
}

async function reconcileRefunds(orderId: string, body: Record<string, any>) {
  const gatewayStatus = String(body.order?.status || '').toUpperCase()
  const gatewayRefunded = Number(body.order?.totalRefundedAmount)
  if (!Number.isFinite(gatewayRefunded) || !['REFUNDED', 'PARTIALLY_REFUNDED', 'EXCESSIVELY_REFUNDED'].includes(gatewayStatus)) return false
  const gatewayRefundedMinor = Math.round(gatewayRefunded * 100)
  let reconciled = false
  await db.$transaction(async tx => {
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
    await restoreCoinsForOrder(tx, order, gatewayRefundedMinor, `gateway-${gatewayRefundedMinor}`)
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
    void sendOrderConfirmationEmail(order.id).catch(error => console.error('[email] order confirmation failed', error))
  } else if (status === 'failed') {
    let transitioned = false
    await db.$transaction(async tx => {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          paymentStatus: true,
          couponCode: true,
          userId: true,
          orderNumber: true,
          grandTotal: true,
          paymentTransactions: { where: { provider: 'checkout' }, select: { rawJson: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        },
      })
      if (!current || ['PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(current.paymentStatus)) return
      await releaseOrderReservations(tx, order.id, 'Online payment failed')
      if (current.couponCode) await tx.coupon.updateMany({ where: { code: current.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
      const coinsUsed = parseCoinsUsed(current.paymentTransactions[0]?.rawJson || null)
      if (coinsUsed > 0 && current.userId) {
        const reversalId = `coin_${current.orderNumber}_payment_failed_reversal`
        await tx.coinTransaction.upsert({ where: { id: reversalId }, create: { id: reversalId, userId: current.userId, amount: coinsUsed, type: 'REVERSAL', reason: 'Failed payment coin restoration', referenceId: `coin-reversal:${current.orderNumber}:payment-failed` }, update: {} })
      }
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
    const limit = consumeRateLimit(`areeba-webhook:${clientIp(req.headers)}`, 60, 60 * 1000)
    if (!limit.allowed) return Response.json({ error: 'Too many webhook requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    const url = new URL(req.url)
    if (!safeTokenEqual(url.searchParams.get('token')?.trim() || '', areebaWebhookToken())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > 128 * 1024) return Response.json({ error: 'Webhook payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
    const rawBody = await req.text()
    if (rawBody.length > 128 * 1024) return Response.json({ error: 'Webhook payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
    const body = (() => { try { return JSON.parse(rawBody) } catch { return {} } })() as Record<string, any>
    const orderNumber = typeof body.order?.id === 'string' ? body.order.id.trim() : typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderNumber || orderNumber.length > 100) return Response.json({ error: 'Invalid payment notification' }, { status: 400 })
    const processed = await processPaymentNotification(orderNumber, body)
    if (!processed) return Response.json({ error: 'Payment notification could not be reconciled' }, { status: 409 })
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Webhook processing failed; retry required' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
