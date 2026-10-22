import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MAX_LOW_STOCK, SELLING_KEYS, SELLING_SETTING_KEYS, lowStockLeft, lowStockThreshold } from '@/lib/selling'

const settings = (value?: string) => (value === undefined ? {} : { [SELLING_KEYS.lowStock]: value })
const base = { threshold: 5, available: 3, trackInventory: true, continueSelling: false }

describe('only a few left: the number the owner sets', () => {
  it('is off until a whole number of 1 or more is saved', () => {
    for (const off of [undefined, '', '0', '-3', 'abc', ' ']) assert.equal(lowStockThreshold(settings(off)), 0, `"${off}" is off`)
    assert.equal(lowStockThreshold(settings('5')), 5)
    assert.equal(lowStockThreshold(settings(' 12 ')), 12)
    assert.equal(lowStockThreshold(settings('3.9')), 3)
  })
  it('never goes above a sensible top', () => assert.equal(lowStockThreshold(settings('5000')), MAX_LOW_STOCK))
  it('is read with the other selling settings and saved by the admin page', () => {
    assert.ok(SELLING_SETTING_KEYS.includes('product.lowStockThreshold'))
    assert.match(readFileSync('app/admin/settings/page.tsx', 'utf8'), /'product\.lowStockThreshold'/)
    assert.match(readFileSync('lib/selling-config.ts', 'utf8'), /lowStock: lowStockThreshold\(map\)/)
  })
})

describe('only a few left: when it shows', () => {
  it('shows the real number when stock is at or below the threshold', () => {
    assert.equal(lowStockLeft(base), 3)
    assert.equal(lowStockLeft({ ...base, available: 5 }), 5)
    assert.equal(lowStockLeft({ ...base, available: 1 }), 1)
  })
  it('stays quiet above the threshold, at zero, or when the feature is off', () => {
    assert.equal(lowStockLeft({ ...base, available: 6 }), 0)
    assert.equal(lowStockLeft({ ...base, available: 0 }), 0)
    assert.equal(lowStockLeft({ ...base, available: -2 }), 0)
    assert.equal(lowStockLeft({ ...base, threshold: 0 }), 0)
  })
  it('never makes up scarcity: not for uncounted products or ones sold when out of stock', () => {
    assert.equal(lowStockLeft({ ...base, trackInventory: false }), 0)
    assert.equal(lowStockLeft({ ...base, continueSelling: true }), 0)
  })
  it('is wired into the product page and has an Arabic text', () => {
    assert.match(readFileSync('components/aliexpress-product.tsx', 'utf8'), /lowStockLeft\(\{ threshold: lowStockThreshold/)
    assert.match(readFileSync('lib/i18n-ar.ts', 'utf8'), /"Only \{n\} left":/)
  })
})
