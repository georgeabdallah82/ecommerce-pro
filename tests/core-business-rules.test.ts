import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canCustomerCancel, canTransitionOrder, canTransitionPayment, fulfillmentForStatus, sumCustomerSpend } from '@/lib/orders'
import { availableQuantity } from '@/lib/inventory'

describe('core ecommerce business rules', () => {
  describe('inventory', () => {
    it('never reports negative available stock', () => {
      assert.equal(availableQuantity({ quantity: 5, reserved: 8 }), 0)
      assert.equal(availableQuantity({ quantity: 8, reserved: 5 }), 3)
    })
  })

  describe('order transitions', () => {
    it('allows only the intended order lifecycle transitions', () => {
      assert.equal(canTransitionOrder('PENDING', 'CONFIRMED'), true)
      assert.equal(canTransitionOrder('CONFIRMED', 'PROCESSING'), true)
      assert.equal(canTransitionOrder('PROCESSING', 'SHIPPED'), true)
      assert.equal(canTransitionOrder('SHIPPED', 'DELIVERED'), true)
      assert.equal(canTransitionOrder('DELIVERED', 'PENDING'), false)
      assert.equal(canTransitionOrder('CANCELLED', 'CONFIRMED'), false)
    })

    it('treats a same-status "transition" as always allowed (idempotent save)', () => {
      assert.equal(canTransitionOrder('PENDING', 'PENDING'), true)
      assert.equal(canTransitionOrder('CANCELLED', 'CANCELLED'), true)
      assert.equal(canTransitionOrder('REFUNDED', 'REFUNDED'), true)
    })

    it('never allows a transition out of a terminal order status', () => {
      assert.equal(canTransitionOrder('CANCELLED', 'PENDING'), false)
      assert.equal(canTransitionOrder('REFUNDED', 'DELIVERED'), false)
    })

    it('only allows DELIVERED to move to REFUNDED', () => {
      assert.equal(canTransitionOrder('DELIVERED', 'REFUNDED'), true)
      assert.equal(canTransitionOrder('DELIVERED', 'SHIPPED'), false)
    })

    it('allows customer cancellation only before fulfillment', () => {
      assert.equal(canCustomerCancel('PENDING'), true)
      assert.equal(canCustomerCancel('CONFIRMED'), true)
      assert.equal(canCustomerCancel('PROCESSING'), false)
      assert.equal(canCustomerCancel('SHIPPED'), false)
      assert.equal(canCustomerCancel('DELIVERED'), false)
    })

    it('maps order status to fulfillment state', () => {
      assert.equal(fulfillmentForStatus('PENDING'), 'UNFULFILLED')
      assert.equal(fulfillmentForStatus('PROCESSING'), 'PARTIAL')
      assert.equal(fulfillmentForStatus('SHIPPED'), 'PARTIAL')
      assert.equal(fulfillmentForStatus('DELIVERED'), 'FULFILLED')
    })

    it('falls back to UNFULFILLED for every other order status', () => {
      assert.equal(fulfillmentForStatus('CONFIRMED'), 'UNFULFILLED')
      assert.equal(fulfillmentForStatus('CANCELLED'), 'UNFULFILLED')
      assert.equal(fulfillmentForStatus('REFUNDED'), 'UNFULFILLED')
    })
  })

  describe('customer spend', () => {
    it('sums grand totals across an order history', () => {
      const orders = [
        { status: 'DELIVERED' as const, grandTotal: 5000 },
        { status: 'SHIPPED' as const, grandTotal: 3000 },
      ]
      assert.equal(sumCustomerSpend(orders), 8000)
    })

    it('excludes cancelled orders from total spend', () => {
      const orders = [
        { status: 'DELIVERED' as const, grandTotal: 5000 },
        { status: 'CANCELLED' as const, grandTotal: 9999 },
      ]
      assert.equal(sumCustomerSpend(orders), 5000)
    })

    it('returns 0 for a customer with no orders', () => {
      assert.equal(sumCustomerSpend([]), 0)
    })

    it('returns 0 when every order was cancelled', () => {
      const orders = [
        { status: 'CANCELLED' as const, grandTotal: 1000 },
        { status: 'CANCELLED' as const, grandTotal: 2000 },
      ]
      assert.equal(sumCustomerSpend(orders), 0)
    })

    it('excludes a fully-refunded order (its refund transactions cover the full grandTotal)', () => {
      const orders = [
        { status: 'DELIVERED' as const, grandTotal: 5000 },
        { status: 'REFUNDED' as const, grandTotal: 4000, paymentTransactions: [{ status: 'refunded', amount: 4000 }] },
      ]
      assert.equal(sumCustomerSpend(orders), 5000)
    })

    it('nets out a partial refund instead of counting the full grandTotal', () => {
      const orders = [
        { status: 'DELIVERED' as const, grandTotal: 5000, paymentTransactions: [{ status: 'partially_refunded', amount: 1200 }] },
      ]
      assert.equal(sumCustomerSpend(orders), 3800)
    })

    it('sums multiple partial refunds on the same order', () => {
      const orders = [
        { status: 'DELIVERED' as const, grandTotal: 5000, paymentTransactions: [{ status: 'partially_refunded', amount: 1000 }, { status: 'partially_refunded', amount: 500 }] },
      ]
      assert.equal(sumCustomerSpend(orders), 3500)
    })

    it('ignores payment transactions that are not refunds', () => {
      const orders = [
        { status: 'DELIVERED' as const, grandTotal: 5000, paymentTransactions: [{ status: 'paid', amount: 5000 }, { status: 'created', amount: 0 }] },
      ]
      assert.equal(sumCustomerSpend(orders), 5000)
    })
  })

  describe('payment transitions', () => {
    it('allows payment success and valid refund progression', () => {
      assert.equal(canTransitionPayment('UNPAID', 'PAID'), true)
      assert.equal(canTransitionPayment('PENDING', 'PAID'), true)
      assert.equal(canTransitionPayment('PAID', 'PARTIALLY_REFUNDED'), true)
      assert.equal(canTransitionPayment('PAID', 'REFUNDED'), true)
      assert.equal(canTransitionPayment('REFUNDED', 'PAID'), false)
      assert.equal(canTransitionPayment('FAILED', 'REFUNDED'), false)
    })

    it('treats a same-status "transition" as always allowed (idempotent save)', () => {
      assert.equal(canTransitionPayment('PAID', 'PAID'), true)
      assert.equal(canTransitionPayment('REFUNDED', 'REFUNDED'), true)
    })

    it('never allows a transition out of REFUNDED', () => {
      assert.equal(canTransitionPayment('REFUNDED', 'PENDING'), false)
      assert.equal(canTransitionPayment('REFUNDED', 'UNPAID'), false)
    })

    it('allows a failed payment to be retried', () => {
      assert.equal(canTransitionPayment('FAILED', 'PENDING'), true)
      assert.equal(canTransitionPayment('FAILED', 'PAID'), true)
    })
  })
})
