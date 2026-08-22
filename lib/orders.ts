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

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) { return from === to || transitions[from].includes(to) }

export function fulfillmentForStatus(status: OrderStatus): FulfillmentStatus {
  if (status === 'DELIVERED') return 'FULFILLED'
  if (status === 'SHIPPED' || status === 'PROCESSING') return 'PARTIAL'
  return 'UNFULFILLED'
}

export function paymentForStatus(status: OrderStatus, current: PaymentStatus): PaymentStatus {
  if (status === 'REFUNDED') return 'REFUNDED'
  if (status === 'CANCELLED' && current !== 'PAID') return current
  return current
}
