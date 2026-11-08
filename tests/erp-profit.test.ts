import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { profitFromLines } from '../lib/erp-overview'

describe('profit from sold lines', () => {
  it('takes cost off the revenue of items that have a cost recorded', () => {
    const result = profitFromLines([{ quantity: 2, totalPrice: 2000, costPrice: 600, ratio: 1 }])
    assert.equal(result.revenueCents, 2000)
    assert.equal(result.costCents, 1200)
    assert.equal(result.profitCents, 800)
    assert.equal(result.coveragePct, 100)
  })

  it('shares a receipt discount out over each line before costing it', () => {
    // 1000 of items with 100 off: the line is worth 900 to the store.
    const result = profitFromLines([{ quantity: 1, totalPrice: 1000, costPrice: 400, ratio: 0.9 }])
    assert.equal(result.revenueCents, 900)
    assert.equal(result.profitCents, 500)
  })

  it('does not inflate profit with items that have no cost: they are revenue only', () => {
    const result = profitFromLines([
      { quantity: 1, totalPrice: 1000, costPrice: 400, ratio: 1 },
      { quantity: 1, totalPrice: 1000, costPrice: null, ratio: 1 },
    ])
    assert.equal(result.revenueCents, 2000)
    assert.equal(result.costedRevenueCents, 1000)
    assert.equal(result.profitCents, 600)
    assert.equal(result.coveragePct, 50)
  })

  it('reports no coverage when there are no sales', () => {
    const result = profitFromLines([])
    assert.equal(result.profitCents, 0)
    assert.equal(result.coveragePct, null)
  })
})
