import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canCustomerCancel, canTransitionOrder, canTransitionPayment, fulfillmentForStatus } from '@/lib/orders'
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
  })
})
