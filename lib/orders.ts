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

// Cancelled orders were never actually paid for/kept, so they are excluded from
// "total spend" everywhere it's shown (customers list, customer detail).
export function sumCustomerSpend(orders: { status: OrderStatus; grandTotal: number }[]) {
  return orders.reduce((sum, order) => order.status === 'CANCELLED' ? sum : sum + order.grandTotal, 0)
}
export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) { return from === to || paymentTransitions[from].includes(to) }
export function canCustomerCancel(status: OrderStatus) { return status === 'PENDING' || status === 'CONFIRMED' }

export function fulfillmentForStatus(status: OrderStatus): FulfillmentStatus {
  if (status === 'DELIVERED') return 'FULFILLED'
  if (status === 'SHIPPED' || status === 'PROCESSING') return 'PARTIAL'
  return 'UNFULFILLED'
}
