import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { discountAmount, taxableAmountAfterRewards, type LineItem } from '@/lib/discounts'

function item(overrides: Partial<LineItem> = {}): LineItem {
  return { productId: 'p1', quantity: 1, unitPrice: 1000, totalPrice: 1000, taxable: true, ...overrides }
}

describe('lib/discounts discountAmount', () => {
  it('splits a whole-cart PERCENTAGE discount proportionally between taxable and non-taxable items', async () => {
    const items = [item({ productId: 'taxed', totalPrice: 6000, taxable: true }), item({ productId: 'exempt', totalPrice: 4000, taxable: false })]
    const split = await discountAmount({ type: 'PERCENTAGE', value: 10 }, items)
    assert.deepEqual(split, { total: 1000, taxable: 600, nonTaxable: 400 })
  })

  it('applies a FIXED discount proportionally by each bucket\'s share of the eligible subtotal', async () => {
    const items = [item({ productId: 'taxed', totalPrice: 6000, taxable: true }), item({ productId: 'exempt', totalPrice: 4000, taxable: false })]
    const split = await discountAmount({ type: 'FIXED', value: 1000 }, items)
    assert.equal(split.total, 1000)
    assert.equal(split.taxable + split.nonTaxable, split.total)
    assert.equal(split.taxable, 600)
    assert.equal(split.nonTaxable, 400)
  })

  it('caps a FIXED discount at the eligible subtotal', async () => {
    const items = [item({ totalPrice: 500, taxable: true })]
    const split = await discountAmount({ type: 'FIXED', value: 5000 }, items)
    assert.equal(split.total, 500)
  })

  it('scopes a discount to SPECIFIC_PRODUCTS, leaving untargeted items with zero discount', async () => {
    const items = [item({ productId: 'a', totalPrice: 1000, taxable: true }), item({ productId: 'b', totalPrice: 1000, taxable: false })]
    const split = await discountAmount({ type: 'PERCENTAGE', value: 50, appliesTo: 'SPECIFIC_PRODUCTS', productIds: ['a'] }, items)
    assert.deepEqual(split, { total: 500, taxable: 500, nonTaxable: 0 })
  })

  it('a coupon landing entirely on non-taxable items has zero taxable discount', async () => {
    const items = [item({ productId: 'exempt', totalPrice: 1000, taxable: false })]
    const split = await discountAmount({ type: 'PERCENTAGE', value: 20, appliesTo: 'SPECIFIC_PRODUCTS', productIds: ['exempt'] }, items)
    assert.deepEqual(split, { total: 200, taxable: 0, nonTaxable: 200 })
  })

  it('BUY_X_GET_Y discounts the cheapest eligible units first, split by their own taxable flag', async () => {
    const items = [
      item({ productId: 'a', quantity: 3, unitPrice: 1000, totalPrice: 3000, taxable: true }),
      item({ productId: 'b', quantity: 1, unitPrice: 500, totalPrice: 500, taxable: false }),
    ]
    // Buy 4 get 1 free, applied to the whole cart -- 4 units total, so exactly 1 "get" unit is
    // earned; the cheapest unit in scope (the 500 non-taxable item) is the one discounted.
    const split = await discountAmount({ type: 'BUY_X_GET_Y', buyQuantity: 4, getQuantity: 1, getDiscountPercent: 100 }, items)
    assert.deepEqual(split, { total: 500, taxable: 0, nonTaxable: 500 })
  })

  it('returns zero for a FREE_SHIPPING coupon (no merchandise discount)', async () => {
    const split = await discountAmount({ type: 'FREE_SHIPPING' }, [item()])
    assert.deepEqual(split, { total: 0, taxable: 0, nonTaxable: 0 })
  })
})

describe('lib/discounts taxableAmountAfterRewards', () => {
  it('leaves the taxable amount untouched when there is no discount or reward', () => {
    assert.equal(taxableAmountAfterRewards(6000, 0, 10000, 0), 6000)
  })

  it('subtracts the taxable share of a coupon discount', () => {
    assert.equal(taxableAmountAfterRewards(6000, 600, 9000, 0), 5400)
  })

  it('prorates a coin/reward discount across the remaining taxable and non-taxable amounts', () => {
    // 6000 taxable + 4000 non-taxable remaining after any coupon (10000 total);
    // a 2000 coin discount should take 60% (1200) off the taxable side.
    assert.equal(taxableAmountAfterRewards(6000, 0, 10000, 2000), 4800)
  })

  it('never goes negative', () => {
    assert.equal(taxableAmountAfterRewards(100, 200, 100, 0), 0)
  })

  it('does not divide by zero when the discounted subtotal is zero', () => {
    assert.equal(taxableAmountAfterRewards(0, 0, 0, 0), 0)
  })
})
