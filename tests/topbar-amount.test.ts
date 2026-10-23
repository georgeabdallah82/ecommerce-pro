import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { syncFreeDeliveryAmount } from '@/lib/topbar-amount'

describe('top bar free-delivery amount', () => {
  it('shows the store\'s real amount in place of the typed one', () => {
    assert.equal(syncFreeDeliveryAmount('Free delivery on orders over $50 · Cash on delivery', '$100'), 'Free delivery on orders over $100 · Cash on delivery')
    assert.equal(syncFreeDeliveryAmount('Free Delivery for orders above 49$ - Cash On Delivery', '$100'), 'Free Delivery for orders above $100 - Cash On Delivery')
    assert.equal(syncFreeDeliveryAmount('Free shipping over 50 USD', '$75'), 'Free shipping over $75')
  })
  it('leaves messages alone when unsure', () => {
    assert.equal(syncFreeDeliveryAmount('Free delivery over $50, or $5 off your first order', '$100'), 'Free delivery over $50, or $5 off your first order')
    assert.equal(syncFreeDeliveryAmount('Summer sale: everything $10', '$100'), 'Summer sale: everything $10')
    assert.equal(syncFreeDeliveryAmount('Free delivery all over Lebanon', '$100'), 'Free delivery all over Lebanon')
    assert.equal(syncFreeDeliveryAmount('Free delivery over $50', ''), 'Free delivery over $50')
  })
})
