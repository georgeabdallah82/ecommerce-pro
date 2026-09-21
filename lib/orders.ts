import { OrderStatus, PaymentStatus, FulfillmentStatus } from '@prisma/client'

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED','CANCELLED'],
  CONFIRMED: ['PROCESSING','CANCELLED'],
  PROCESSING: ['SHIPPED','CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: []
}

const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  UNPAID: ['PENDING','PAID','FAILED'],
  PENDING: ['PAID','FAILED','UNPAID'],
  PAID: ['PARTIALLY_REFUNDED','REFUNDED'],
  FAILED: ['PENDING','PAID'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED: []
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) { return from === to || transitions[from].includes(to) }

// Cancelled orders were never actually paid for/kept, so they're excluded outright. Every
// other order nets out whatever's actually been refunded (mirrors remainingRefundable in
// lib/returns.ts) -- a fully-refunded order's refund transactions always sum to >= grandTotal
// (see settleReturnRefund), so it naturally zeroes out here without needing its own check for
// status === 'REFUNDED'; a partially-refunded order counts only what the customer actually kept
// paying. This is what "total spend"/LTV means everywhere it's shown (customers list, detail).
export function sumCustomerSpend(orders: { status: OrderStatus; grandTotal: number; paymentTransactions?: { status: string; amount: number }[] }[]) {
  return orders.reduce((sum, order) => {
    if (order.status === 'CANCELLED') return sum
    const refunded = (order.paymentTransactions || [])
      .filter(t => t.status === 'refunded' || t.status === 'partially_refunded')
      .reduce((s, t) => s + t.amount, 0)
    return sum + Math.max(0, order.grandTotal - refunded)
  }, 0)
}
export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) { return from === to || paymentTransitions[from].includes(to) }
export function canCustomerCancel(status: OrderStatus) { return status === 'PENDING' || status === 'CONFIRMED' }

export function fulfillmentForStatus(status: OrderStatus): FulfillmentStatus {
  if (status === 'DELIVERED') return 'FULFILLED'
  if (status === 'SHIPPED' || status === 'PROCESSING') return 'PARTIAL'
  return 'UNFULFILLED'
}
