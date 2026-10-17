import { releaseOrderReservations } from '@/lib/inventory'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'

// What cancelling an order for a customer undoes, in one place: used when a signed-in customer
// cancels from their account (app/api/account/orders/[orderNumber]/cancel) and when a customer
// without an account cancels from Track my order (app/api/orders/cancel). The caller has already
// checked who is asking and that the order may still be cancelled; this runs inside its
// transaction.

export type CancellableOrder = {
  id: string
  orderNumber: string
  userId: string | null
  couponCode: string | null
  paymentStatus: string
  grandTotal: number
  paymentTransactions: Array<{ provider: string; rawJson: string | null }>
}

function redeemedCoins(paymentTransactions: Array<{ provider: string; rawJson: string | null }>) {
  const checkout = paymentTransactions.find(t => t.provider === 'checkout' && t.rawJson)
  if (!checkout?.rawJson) return 0
  try {
    const parsed = JSON.parse(checkout.rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

export async function cancelOrderForCustomer(tx: any, order: CancellableOrder, eventMessage: string) {
  await releaseOrderReservations(tx, order.id, 'Customer cancelled order')

  const coinsUsed = order.userId ? redeemedCoins(order.paymentTransactions) : 0
  if (order.userId && coinsUsed > 0) {
    const reversalId = `coin_${order.userId}_${order.orderNumber}_reversal`
    await tx.coinTransaction.upsert({
      where: { id: reversalId },
      create: {
        id: reversalId,
        userId: order.userId,
        amount: coinsUsed,
        type: 'REVERSAL',
        reason: 'Cancelled order coin restoration',
        referenceId: `coin-reversal:${order.orderNumber}`,
      },
      update: {},
    })
  }

  const redeemed = redeemedGiftCard(order.paymentTransactions)
  if (redeemed) await restoreGiftCardBalance(tx, order.id, redeemed, order.grandTotal, order.grandTotal)

  // Matches the admin-cancel path (app/api/admin/orders/route.ts) and checkout's own
  // failure/expiry cleanup (checkout.ts, the areeba webhook) -- a coupon's usedCount is
  // released the same way regardless of who or what cancelled the order, so a customer
  // self-cancelling doesn't permanently burn a use of a limited-use coupon that a staff
  // cancellation or a failed payment would have correctly given back.
  if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })

  return tx.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      fulfillmentStatus: 'UNFULFILLED',
      paymentStatus: order.paymentStatus,
      events: { create: { status: 'CANCELLED', message: eventMessage } },
    },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true, fulfillmentStatus: true, grandTotal: true, currency: true },
  })
}
