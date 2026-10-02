import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { releaseOrderReservations } from '@/lib/inventory'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { runInBackground } from '@/lib/background'

// What happens when the card gateway confirms an order paid or failed. Both the customer's
// return redirect and the gateway's webhook can deliver the same news, in either order, so
// the side effects live here once: each applies only on the transition, never twice. (The
// return route used to skip restoring coins/gift card on failure, and because it usually
// arrives first, the webhook then saw FAILED and skipped them too.)

export function parseCoinsUsed(rawJson: string | null) {
  if (!rawJson) return 0
  try {
    const parsed = JSON.parse(rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

type Source = 'return' | 'webhook'

export async function markOnlinePaymentPaid(order: { id: string; orderNumber: string }, transactionId: string, source: Source) {
  let transitioned = false
  await db.$transaction(async tx => {
    const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } })
    if (current?.paymentStatus !== 'PAID') {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
      transitioned = true
    }
    await tx.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'paid' } })
  })
  if (!transitioned) return false
  await audit(null, 'payment.paid', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber, source })
  runInBackground(sendOrderConfirmationEmail(order.id).catch(error => console.error('[email] order confirmation failed', error)))
  runInBackground(dispatchWebhookEvent('order.updated', { id: order.id, orderNumber: order.orderNumber, paymentStatus: 'PAID' }).catch(error => console.error('[webhook] order.updated dispatch failed', error)))
  return true
}

export async function markOnlinePaymentFailed(order: { id: string; orderNumber: string }, transactionId: string, source: Source) {
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
        paymentTransactions: { where: { provider: 'checkout' }, select: { provider: true, rawJson: true }, orderBy: { createdAt: 'asc' }, take: 1 },
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
    const redeemedGc = redeemedGiftCard(current.paymentTransactions)
    if (redeemedGc) await restoreGiftCardBalance(tx, order.id, redeemedGc, current.grandTotal, current.grandTotal)
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'CANCELLED', events: { create: { status: 'CANCELLED', message: 'Online payment failed.' } } } })
    await tx.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'failed' } })
    transitioned = true
  })
  if (!transitioned) return false
  await audit(null, 'payment.failed', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber, source })
  runInBackground(dispatchWebhookEvent('order.updated', { id: order.id, orderNumber: order.orderNumber, paymentStatus: 'FAILED' }).catch(error => console.error('[webhook] order.updated dispatch failed', error)))
  return true
}
