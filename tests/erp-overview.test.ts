import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { startOfStoreMonth, stockOverview } from '../lib/erp-overview'

describe('stock overview', () => {
  it('counts a product out of stock when nothing is available across its locations', () => {
    const result = stockOverview([
      { productId: 'a', quantity: 4, reserved: 4, costPrice: 100 },
      { productId: 'b', quantity: 0, reserved: 0, costPrice: 100 },
      { productId: 'c', quantity: 2, reserved: 0, costPrice: 100 },
    ])
    assert.equal(result.trackedProducts, 3)
    assert.equal(result.outOfStock, 2)
  })

  it('does not count a product as out of stock when one location still has units', () => {
    const result = stockOverview([
      { productId: 'a', quantity: 0, reserved: 0, costPrice: 100 },
      { productId: 'a', quantity: 3, reserved: 0, costPrice: 100 },
    ])
    assert.equal(result.outOfStock, 0)
  })

  it('values stock on hand at cost, and never values reserved-only or negative rows', () => {
    const result = stockOverview([
      { productId: 'a', quantity: 10, reserved: 2, costPrice: 250 },
      { productId: 'b', quantity: 0, reserved: 0, costPrice: 999 },
    ])
    assert.equal(result.valuationCents, 2500)
  })

  it('reports products that have stock but no cost price, instead of guessing a value', () => {
    const result = stockOverview([{ productId: 'a', quantity: 5, reserved: 0, costPrice: null }])
    assert.equal(result.valuationCents, 0)
    assert.equal(result.productsWithoutCost, 1)
  })
})

describe('store month start', () => {
  it('starts at midnight on the 1st in the store timezone', () => {
    const now = new Date('2026-11-15T10:30:00Z')
    const start = startOfStoreMonth(now, 'Asia/Beirut')
    // Beirut is UTC+2 in November: midnight on 1 Nov is 2026-10-31T22:00Z.
    assert.equal(start.toISOString(), '2026-10-31T22:00:00.000Z')
  })

  it('is the same moment for any time on the first day of the month', () => {
    const start = startOfStoreMonth(new Date('2026-11-01T05:00:00Z'), 'UTC')
    assert.equal(start.toISOString(), '2026-11-01T00:00:00.000Z')
  })
})
