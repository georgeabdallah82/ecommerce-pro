import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyCartValidation } from '@/lib/cart-sync'

const cart = [
  { productId: 'a', variantId: null, name: 'Tissue', price: 1000, quantity: 2 },
  { productId: 'b', variantId: 'v1', name: 'Box — Large', price: 500, quantity: 5 },
  { productId: 'c', variantId: null, name: 'Mug', price: 300, quantity: 1 },
]

describe('applyCartValidation', () => {
  it('updates prices, caps quantities to stock and drops unavailable items', () => {
    const { items, changes } = applyCartValidation(cart, [
      { productId: 'a', variantId: null, status: 'ok', price: 1200, available: null },
      { productId: 'b', variantId: 'v1', status: 'ok', price: 500, available: 3 },
      { productId: 'c', variantId: null, status: 'unavailable' },
    ])
    assert.deepEqual(items.map(i => [i.productId, i.price, i.quantity]), [['a', 1200, 2], ['b', 500, 3]])
    assert.equal(changes.length, 3)
  })
  it('leaves an up-to-date cart alone', () => {
    const { items, changes } = applyCartValidation(cart.slice(0, 1), [{ productId: 'a', variantId: null, status: 'ok', price: 1000, available: 10 }])
    assert.deepEqual(items, cart.slice(0, 1))
    assert.equal(changes.length, 0)
  })
  it('treats zero stock as unavailable', () => {
    const { items } = applyCartValidation(cart.slice(0, 1), [{ productId: 'a', variantId: null, status: 'ok', price: 1000, available: 0 }])
    assert.equal(items.length, 0)
  })
})
