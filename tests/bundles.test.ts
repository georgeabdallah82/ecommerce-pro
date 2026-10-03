import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bundleDiscount, normalizeBundleConfig, saveBundleConfig } from '@/lib/bundles'

const bundle = { id: 'b1', name: 'Clean set', description: '', active: true, price: 1500, items: [{ productId: 'p1', variantId: null, quantity: 1 }, { productId: 'p2', variantId: 'v2', quantity: 2 }] }
// p1 costs 10.00, p2/v2 costs 4.00: the set is 18.00 separately, 15.00 as a bundle.
const priced = [
  { productId: 'p1', variantId: null, unitPrice: 1000, taxable: true },
  { productId: 'p2', variantId: 'v2', unitPrice: 400, taxable: false },
]

describe('lib/bundles normalizeBundleConfig', () => {
  it('is off by default and drops nameless bundles and duplicate items', () => {
    const config = normalizeBundleConfig({ bundles: [{ id: 'x', name: '' }, { id: 'y', name: 'Set', price: '250', items: [{ productId: 'a' }, { productId: 'a' }, { productId: 'b', quantity: 99 }] }] })
    assert.equal(config.enabled, false)
    assert.equal(config.bundles.length, 1)
    assert.deepEqual(config.bundles[0].items, [{ productId: 'a', variantId: null, quantity: 1 }, { productId: 'b', variantId: null, quantity: 20 }])
    assert.equal(config.bundles[0].price, 250)
  })
})

describe('lib/bundles bundleDiscount', () => {
  it('gives nothing while bundles are switched off', async () => {
    await saveBundleConfig({ enabled: false, bundles: [bundle] })
    const result = await bundleDiscount([{ productId: 'p1', variantId: null, quantity: 1, bundleId: 'b1' }, { productId: 'p2', variantId: 'v2', quantity: 2, bundleId: 'b1' }], priced)
    assert.equal(result.total, 0)
  })

  it('discounts each complete set and splits it by taxability', async () => {
    await saveBundleConfig({ enabled: true, bundles: [bundle] })
    const result = await bundleDiscount([{ productId: 'p1', variantId: null, quantity: 2, bundleId: 'b1' }, { productId: 'p2', variantId: 'v2', quantity: 5, bundleId: 'b1' }], priced)
    // Two complete sets (5 units of p2 only fill two sets of 2), 3.00 off each.
    assert.equal(result.total, 600)
    assert.equal(result.taxable + result.nonTaxable, 600)
    assert.equal(result.taxable, Math.round(600 * 1000 / 1800))
    assert.deepEqual(result.applied.map(a => a.sets), [2])
  })

  it('ignores lines not added as part of the bundle and incomplete sets', async () => {
    await saveBundleConfig({ enabled: true, bundles: [bundle] })
    const loose = await bundleDiscount([{ productId: 'p1', variantId: null, quantity: 1 }, { productId: 'p2', variantId: 'v2', quantity: 2 }], priced)
    assert.equal(loose.total, 0)
    const partial = await bundleDiscount([{ productId: 'p1', variantId: null, quantity: 1, bundleId: 'b1' }, { productId: 'p2', variantId: 'v2', quantity: 1, bundleId: 'b1' }], priced)
    assert.equal(partial.total, 0)
  })

  it('never makes a bundle dearer than its items, or applies an inactive one', async () => {
    await saveBundleConfig({ enabled: true, bundles: [{ ...bundle, price: 2000 }] })
    const lines = [{ productId: 'p1', variantId: null, quantity: 1, bundleId: 'b1' }, { productId: 'p2', variantId: 'v2', quantity: 2, bundleId: 'b1' }]
    assert.equal((await bundleDiscount(lines, priced)).total, 0)
    await saveBundleConfig({ enabled: true, bundles: [{ ...bundle, active: false }] })
    assert.equal((await bundleDiscount(lines, priced)).total, 0)
  })
})
