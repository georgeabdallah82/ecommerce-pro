import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeVariantPlan, freeSku, optionCombinations, optionKey, parseOptionJson, planVariants, stockOf, type VariantLike } from '@/lib/variant-plan'

type V = VariantLike & { name: string; id?: string }
const variant = (name: string, sku: string, options: Record<string, string>, quantity = 0): V => ({ name, sku, optionJson: JSON.stringify(options), quantity })
const make = (combo: { name: string; options: Record<string, string> }, sku: string): V => ({ name: combo.name, sku, optionJson: JSON.stringify(combo.options), quantity: 0 })

describe('optionCombinations', () => {
  it('makes every combination of the named options', () => {
    const combos = optionCombinations(['Size', 'Colour'], [['S', 'M'], ['Red', 'Blue']])
    assert.deepEqual(combos.map(c => c.name), ['S / Red', 'S / Blue', 'M / Red', 'M / Blue'])
    assert.deepEqual(combos[0].options, { Size: 'S', Colour: 'Red' })
  })
  it('ignores options without a name or without values', () => {
    assert.equal(optionCombinations([''], [['S']]).length, 0)
    assert.deepEqual(optionCombinations(['Size', 'Colour'], [['S'], []]).map(c => c.name), ['S'])
  })
})

describe('optionKey and parseOptionJson', () => {
  it('treats the same options in another order as the same variant', () => {
    assert.equal(optionKey({ Size: 'S', Colour: 'Red' }), optionKey({ Colour: 'Red', Size: 'S' }))
  })
  it('reads bad JSON as no options', () => {
    assert.deepEqual(parseOptionJson('not json'), {})
    assert.deepEqual(parseOptionJson('["S"]'), {})
  })
})

describe('freeSku', () => {
  it('skips SKUs already in use, including differently cased ones', () => {
    assert.equal(freeSku('OIL', new Set()), 'OIL-1')
    assert.equal(freeSku('OIL', new Set(['oil-1'])), 'OIL-2')
    assert.equal(freeSku('OIL', new Set(['oil-1', 'oil-2'])), 'OIL-3')
  })
})

describe('planVariants', () => {
  it('keeps existing variants whose options still match, and adds the new ones', () => {
    const red = variant('S / Red', 'OIL-1', { Size: 'S', Colour: 'Red' }, 7)
    const plan = planVariants([red], ['Size', 'Colour'], [['S', 'M'], ['Red']], 'OIL', make)
    assert.deepEqual(plan.next.map(v => v.name), ['S / Red', 'M / Red'])
    assert.equal(plan.next[0], red, 'the existing variant object (and its stock) is kept')
    assert.equal(plan.added.length, 1)
    assert.equal(plan.removed.length, 0)
  })
  it('gives new variants SKUs that do not clash with existing ones', () => {
    const plan = planVariants([variant('S', 'OIL-1', { Size: 'S' }), variant('L', 'OIL-2', { Size: 'L' })], ['Size'], [['S', 'M', 'L', 'XL']], 'OIL', make)
    assert.deepEqual(plan.added.map(v => v.sku), ['OIL-3', 'OIL-4'])
  })
  it('lists the variants that would be removed, with their stock', () => {
    const gone = variant('L', 'OIL-2', { Size: 'L' }, 12)
    const plan = planVariants([variant('S', 'OIL-1', { Size: 'S' }), gone], ['Size'], [['S']], 'OIL', make)
    assert.deepEqual(plan.removed, [gone])
    assert.equal(stockOf(plan.removed[0]), 12)
  })
  it('uses the stock records when a variant has no single quantity', () => {
    assert.equal(stockOf({ sku: 'x', optionJson: '{}', inventory: [{ quantity: 5, reserved: 1 }, { quantity: 3, reserved: 0 }] }), 7)
  })
  it('describes the plan in words', () => {
    const plan = planVariants([variant('S', 'OIL-1', { Size: 'S' }), variant('L', 'OIL-2', { Size: 'L' })], ['Size'], [['S', 'M']], 'OIL', make)
    assert.equal(describeVariantPlan(plan), 'adds 1, keeps 1, removes 1')
  })
})
