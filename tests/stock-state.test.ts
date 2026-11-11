import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SCHEMA_AVAILABILITY, SHARE_AVAILABILITY, stockLeft, stockState } from '@/lib/card-stock'

describe('lib/card-stock stockLeft', () => {
  it('counts each option on its own rows, and falls back to the shared rows', () => {
    const left = stockLeft({
      inventory: [
        { variantId: 'a', quantity: 5, reserved: 2 }, // option a: 3 left
        { variantId: null, quantity: 4, reserved: 1 }, // shared: 3 left, used by option b (it has no rows of its own)
      ],
      variants: [{ id: 'a' }, { id: 'b' }],
    })
    assert.deepEqual(left.variants, [{ id: 'a', available: 3 }, { id: 'b', available: 3 }])
    assert.equal(left.product, 3)
  })

  it('takes the best option for the product, and counts shared stock for a product without options', () => {
    assert.equal(stockLeft({ inventory: [{ variantId: 'a', quantity: 1, reserved: 0 }, { variantId: 'b', quantity: 6, reserved: 0 }], variants: [{ id: 'a' }, { id: 'b' }] }).product, 6)
    assert.equal(stockLeft({ inventory: [{ variantId: null, quantity: 7, reserved: 2 }], variants: [] }).product, 5)
  })

  it('never reports negative units', () => {
    assert.equal(stockLeft({ inventory: [{ variantId: null, quantity: 1, reserved: 3 }], variants: [] }).product, 0)
  })
})

describe('lib/card-stock stockState', () => {
  it('is in stock while units are left, and out of stock when they are gone', () => {
    assert.equal(stockState({ available: 2, trackInventory: true }), 'in_stock')
    assert.equal(stockState({ available: 0, trackInventory: true }), 'out_of_stock')
  })

  it('sells on at zero stock when it continues selling, or when stock is not tracked', () => {
    assert.equal(stockState({ available: 0, trackInventory: true, continueSellingWhenOutOfStock: true }), 'in_stock')
    assert.equal(stockState({ available: 0, trackInventory: false }), 'in_stock')
  })

  it('is a pre-order once a pre-order product is sold out, and only then', () => {
    assert.equal(stockState({ available: 0, trackInventory: true, continueSellingWhenOutOfStock: true, preorder: true }), 'preorder')
    assert.equal(stockState({ available: 4, trackInventory: true, continueSellingWhenOutOfStock: true, preorder: true }), 'in_stock')
    // Stock that isn't tracked is always for sale, so there is no sold-out moment to take pre-orders in.
    assert.equal(stockState({ available: 0, trackInventory: false, continueSellingWhenOutOfStock: true, preorder: true }), 'in_stock')
  })
})

describe('lib/card-stock availability labels', () => {
  it('writes the same state for search engines and for share links', () => {
    assert.equal(SCHEMA_AVAILABILITY.preorder, 'https://schema.org/PreOrder')
    assert.equal(SCHEMA_AVAILABILITY.out_of_stock, 'https://schema.org/OutOfStock')
    assert.equal(SHARE_AVAILABILITY.in_stock, 'in stock')
    assert.equal(SHARE_AVAILABILITY.preorder, 'preorder')
  })
})
