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

// Gives back what an unpaid card checkout used -- the coupon use, redeemed coins and gift-card
// balance -- when the order dies without being paid (payment failed, or the reservation expired).
// Each step is keyed to the order, so running it again is harmless.
export async function restoreUnpaidCheckoutBenefits(tx: any, order: { id: string; orderNumber: string; userId: string | null; couponCode: string | null; grandTotal: number; paymentTransactions: Array<{ provider: string; rawJson: string | null }> }, reason: string) {
  if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
  const checkoutTx = order.paymentTransactions.filter(t => t.provider === 'checkout')
  const coinsUsed = parseCoinsUsed(checkoutTx[0]?.rawJson || null)
  if (coinsUsed > 0 && order.userId) {
    const reversalId = `coin_${order.orderNumber}_payment_failed_reversal`
    await tx.coinTransaction.upsert({ where: { id: reversalId }, create: { id: reversalId, userId: order.userId, amount: coinsUsed, type: 'REVERSAL', reason, referenceId: `coin-reversal:${order.orderNumber}:payment-failed` }, update: {} })
  }
  const redeemedGc = redeemedGiftCard(checkoutTx)
  if (redeemedGc) await restoreGiftCardBalance(tx, order.id, redeemedGc, order.grandTotal, order.grandTotal)
}

export async function markOnlinePaymentPaid(order: { id: string; orderNumber: string }, transactionId: string, source: Source) {
  let transitioned = false
  let afterCancel = false
  await db.$transaction(async tx => {
    const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true, status: true } })
    if (current?.paymentStatus !== 'PAID') {
      // The money arrived after the order was cancelled (the customer cancelled, or the unpaid
      // reservation expired while they were still on the bank's page): record the payment and
      // flag it on the order so staff refund it or re-open the order -- it used to be marked
      // paid silently, a cancelled order quietly holding the customer's money.
      afterCancel = current?.status === 'CANCELLED'
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', ...(afterCancel ? { events: { create: { status: 'CANCELLED', message: 'Card payment received after this order was cancelled. Refund the customer, or contact them to place it again.' } } } : {}) } })
      transitioned = true
    }
    await tx.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'paid' } })
  })
  if (!transitioned) return false
  await audit(null, afterCancel ? 'payment.paid_after_cancel' : 'payment.paid', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber, source })
  if (afterCancel) return true
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
        status: true,
        couponCode: true,
        userId: true,
        orderNumber: true,
        grandTotal: true,
        paymentTransactions: { where: { provider: 'checkout' }, select: { provider: true, rawJson: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
    })
    if (!current || ['PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(current.paymentStatus)) return
    if (current.status === 'CANCELLED') {
      // Already cancelled (by the customer, staff or the expired-reservation job), which gave
      // back the coupon, coins and gift card itself -- only record the failed payment, or
      // they'd be given back a second time.
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } })
      await tx.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'failed' } })
      return
    }
    await releaseOrderReservations(tx, order.id, 'Online payment failed')
    await restoreUnpaidCheckoutBenefits(tx, { id: order.id, orderNumber: current.orderNumber, userId: current.userId, couponCode: current.couponCode, grandTotal: current.grandTotal, paymentTransactions: current.paymentTransactions }, 'Failed payment coin restoration')
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'CANCELLED', events: { create: { status: 'CANCELLED', message: 'Online payment failed.' } } } })
    await tx.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'failed' } })
    transitioned = true
  })
  if (!transitioned) return false
  await audit(null, 'payment.failed', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber, source })
  runInBackground(dispatchWebhookEvent('order.updated', { id: order.id, orderNumber: order.orderNumber, paymentStatus: 'FAILED' }).catch(error => console.error('[webhook] order.updated dispatch failed', error)))
  return true
}
