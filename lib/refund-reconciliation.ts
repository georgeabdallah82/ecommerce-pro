import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { areebaOrderRefunds } from '@/lib/payments'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { parseCoinsUsed } from '@/lib/payment-outcome'

// Used by the gateway's payment records (lib/payments.ts). A refund record keeps the gateway it was made on.
const GATEWAY_PROVIDER = 'areeba_mpgs'
// Gateway states in which the gateway has refunded some of the money.
const REFUNDED_GATEWAY_STATES = ['REFUNDED', 'PARTIALLY_REFUNDED', 'EXCESSIVELY_REFUNDED']

// Decides whether the gateway confirms the refunds an order is waiting on. Its refunded total must cover every refund
// already recorded plus every refund still pending. A smaller total records nothing: it is left for a later check.
export function refundOutcome(input: { gatewayStatus: string; gatewayRefunded: number; alreadyRefunded: number; pendingAmount: number; grandTotal: number }): { settle: false } | { settle: true; refundedMinor: number; paymentStatus: 'REFUNDED' | 'PARTIALLY_REFUNDED' } {
  if (!Number.isFinite(input.gatewayRefunded) || !REFUNDED_GATEWAY_STATES.includes(input.gatewayStatus)) return { settle: false }
  const refundedMinor = Math.round(input.gatewayRefunded * 100)
  if (refundedMinor < input.alreadyRefunded + input.pendingAmount) return { settle: false }
  return { settle: true, refundedMinor, paymentStatus: refundedMinor >= input.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED' }
}

// The coins a refund gives back. What is already restored is summed first, so a second call adds only the difference.
async function restoreCoinsForOrder(tx: any, order: { id: string; orderNumber: string; grandTotal: number; userId: string | null }, refundedMinor: number, referenceSuffix: string) {
  if (!order.userId || order.grandTotal <= 0) return 0
  const checkoutTx = await tx.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'checkout' }, orderBy: { createdAt: 'asc' }, select: { rawJson: true } })
  const coinsUsed = parseCoinsUsed(checkoutTx?.rawJson || null)
  if (!coinsUsed) return 0
  const prefix = `coin-refund:${order.id}:`
  const alreadyRestoredAggregate = await tx.coinTransaction.aggregate({ where: { userId: order.userId, type: 'REFUND', referenceId: { startsWith: prefix } }, _sum: { amount: true } })
  const alreadyRestored = Math.max(0, Number(alreadyRestoredAggregate._sum.amount || 0))
  const targetRestored = Math.min(coinsUsed, Math.floor(coinsUsed * Math.max(0, Math.min(refundedMinor, order.grandTotal)) / order.grandTotal))
  const delta = targetRestored - alreadyRestored
  if (delta <= 0) return 0
  await tx.coinTransaction.create({ data: { id: `coin_refund_${order.id}_${referenceSuffix}`, userId: order.userId, amount: delta, type: 'REFUND', reason: 'Order refund coin restoration', referenceId: `${prefix}${referenceSuffix}` } })
  return delta
}

// Records the refunds an order is waiting on, from the gateway's own totals. A webhook body only says that something happened,
// so it is never trusted for money. Returns true when refunds were recorded here.
// The order's row is locked first, so this and a refund being recorded at the same moment run one after the other, and the
// second one finds nothing left to record. The transaction must be real: without one the steps could be applied partly.
export async function reconcileGatewayRefunds(orderId: string, orderNumber: string): Promise<boolean> {
  // Only an order with a refund in flight needs the gateway.
  const inFlight = await db.paymentTransaction.findFirst({ where: { orderId, status: 'refund_pending' }, select: { id: true } })
  if (!inFlight) return false
  const gateway = await areebaOrderRefunds(orderNumber)
  let reconciled = false
  let payload: { id: string; orderNumber: string; paymentStatus: string } | null = null
  let refundedMinor = 0
  await db.$transaction(async tx => {
    await tx.order.update({ where: { id: orderId }, data: { updatedAt: new Date() } })
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { paymentTransactions: true } })
    if (!order) return
    const pending = order.paymentTransactions.filter(t => t.status === 'refund_pending')
    if (!pending.length) return
    const alreadyRefunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
    const pendingAmount = pending.reduce((sum, t) => sum + t.amount, 0)
    const outcome = refundOutcome({ gatewayStatus: gateway.status, gatewayRefunded: gateway.totalRefunded, alreadyRefunded, pendingAmount, grandTotal: order.grandTotal })
    if (!outcome.settle) return
    for (const transaction of pending) await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'refunded' } })
    const status = outcome.paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status
    await restoreCoinsForOrder(tx, order, outcome.refundedMinor, `gateway-${outcome.refundedMinor}`)
    // The gift card comes back the same way a refund made in the store restores it (lib/gift-cards.ts).
    const redeemedGift = redeemedGiftCard(order.paymentTransactions)
    if (redeemedGift) await restoreGiftCardBalance(tx, order.id, redeemedGift, outcome.refundedMinor, order.grandTotal)
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: outcome.paymentStatus, status, events: { create: { status, message: `Gateway refund confirmed (${outcome.refundedMinor} ${order.currency}).` } } } })
    refundedMinor = outcome.refundedMinor
    reconciled = true
    payload = { id: order.id, orderNumber: order.orderNumber, paymentStatus: outcome.paymentStatus }
  }, { requireTransaction: true } as any)
  if (reconciled) {
    await audit(null, 'order.refund_reconciled', 'Order', orderId, { provider: GATEWAY_PROVIDER, gatewayStatus: gateway.status, refundedMinor })
    runInBackground(dispatchWebhookEvent('order.updated', payload!).catch(error => console.error('[webhook] order.updated dispatch failed', error)))
  }
  return reconciled
}

// The orders with a gateway refund the store has not recorded, older than the cutoff. Younger ones are still in flight:
// the request that issued them, or the gateway's notification, has not finished yet.
export async function ordersAwaitingGatewayRefund(olderThan: Date, limit: number): Promise<Array<{ orderId: string; orderNumber: string }>> {
  const rows = await db.paymentTransaction.findMany({
    where: { status: 'refund_pending', provider: GATEWAY_PROVIDER, createdAt: { lt: olderThan } },
    select: { orderId: true, order: { select: { orderNumber: true } } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  const seen = new Set<string>()
  const orders: Array<{ orderId: string; orderNumber: string }> = []
  for (const row of rows) {
    if (seen.has(row.orderId)) continue
    seen.add(row.orderId)
    orders.push({ orderId: row.orderId, orderNumber: row.order.orderNumber })
  }
  return orders
}
