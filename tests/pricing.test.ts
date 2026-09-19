import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it, beforeEach } from 'node:test'
import { db } from '@/lib/prisma'
import { getTaxRatePercent, resolveFreeShippingThresholdCents } from '@/lib/pricing'

// The mock DB backing db.taxRate is a module-level array shared by every test
// in this file (there's no real per-test database to isolate against), so a
// wildcard ('*') zone created in one test would otherwise leak into the next.
// Clear it -- and the legacy flat-rate setting -- before each test.
beforeEach(async () => {
  const existing = await db.taxRate.findMany()
  await Promise.all(existing.map(row => db.taxRate.delete({ where: { id: row.id } })))
  await db.setting.upsert({ where: { key: 'checkout.taxRatePercent' }, update: { value: '0' }, create: { key: 'checkout.taxRatePercent', value: '0' } })
})

async function makeTaxRate(overrides: Partial<{ name: string; countries: string; rate: number; isActive: boolean }> = {}) {
  return db.taxRate.create({
    data: {
      name: overrides.name ?? `Zone ${randomUUID()}`,
      countries: overrides.countries ?? '*',
      rate: overrides.rate ?? 10,
      isActive: overrides.isActive ?? true,
    },
  })
}

describe('lib/pricing getTaxRatePercent', () => {
  it('falls back to the legacy flat setting when no country is given', async () => {
    await db.setting.upsert({ where: { key: 'checkout.taxRatePercent' }, update: { value: '7.5' }, create: { key: 'checkout.taxRatePercent', value: '7.5' } })
    const rate = await getTaxRatePercent()
    assert.equal(rate, 7.5)
  })

  it('falls back to the legacy flat setting when no zone matches the country', async () => {
    await db.setting.upsert({ where: { key: 'checkout.taxRatePercent' }, update: { value: '3' }, create: { key: 'checkout.taxRatePercent', value: '3' } })
    const rate = await getTaxRatePercent(`ZZ-${randomUUID().slice(0, 4)}`)
    assert.equal(rate, 3)
  })

  it('prefers a country-specific zone over the legacy flat setting', async () => {
    await db.setting.upsert({ where: { key: 'checkout.taxRatePercent' }, update: { value: '3' }, create: { key: 'checkout.taxRatePercent', value: '3' } })
    const code = `DE${randomUUID().slice(0, 4)}`
    await makeTaxRate({ name: 'Germany VAT', countries: code, rate: 19 })
    const rate = await getTaxRatePercent(code)
    assert.equal(rate, 19)
  })

  it('matches a country inside a comma-separated list, case-insensitively', async () => {
    const codeA = `FR${randomUUID().slice(0, 4)}`
    const codeB = `IT${randomUUID().slice(0, 4)}`
    await makeTaxRate({ name: 'EU zone', countries: `${codeA}, ${codeB}`, rate: 20 })
    const rate = await getTaxRatePercent(codeB.toLowerCase())
    assert.equal(rate, 20)
  })

  it('falls back to a wildcard zone when no specific country zone matches', async () => {
    await makeTaxRate({ name: 'Global fallback', countries: '*', rate: 12 })
    const rate = await getTaxRatePercent(`NOWHERE-${randomUUID().slice(0, 4)}`)
    assert.equal(rate, 12)
  })

  it('prefers a specific country zone over a wildcard zone', async () => {
    const code = `US${randomUUID().slice(0, 4)}`
    await makeTaxRate({ name: 'Global fallback', countries: '*', rate: 12 })
    await makeTaxRate({ name: 'US zone', countries: code, rate: 8.25 })
    const rate = await getTaxRatePercent(code)
    assert.equal(rate, 8.25)
  })

  it('ignores an inactive zone even when its country matches', async () => {
    const code = `CA${randomUUID().slice(0, 4)}`
    await db.setting.upsert({ where: { key: 'checkout.taxRatePercent' }, update: { value: '2' }, create: { key: 'checkout.taxRatePercent', value: '2' } })
    await makeTaxRate({ name: 'Disabled zone', countries: code, rate: 15, isActive: false })
    const rate = await getTaxRatePercent(code)
    assert.equal(rate, 2)
  })

  it('normalizes "Lebanon" to the LB country code', async () => {
    await makeTaxRate({ name: 'Lebanon VAT', countries: 'LB', rate: 11 })
    const rate = await getTaxRatePercent('Lebanon')
    assert.equal(rate, 11)
  })

  it('clamps an out-of-range rate to [0, 100]', async () => {
    const code = `XX${randomUUID().slice(0, 4)}`
    await makeTaxRate({ name: 'Bad rate', countries: code, rate: 250 })
    const rate = await getTaxRatePercent(code)
    assert.equal(rate, 100)
  })
})

describe('lib/pricing resolveFreeShippingThresholdCents', () => {
  it('converts a configured dollar threshold to cents', () => {
    assert.equal(resolveFreeShippingThresholdCents('75'), 7500)
  })

  it('rounds a fractional dollar threshold to the nearest cent', () => {
    assert.equal(resolveFreeShippingThresholdCents('49.99'), 4999)
  })

  it('falls back to the $100 default when unset', () => {
    assert.equal(resolveFreeShippingThresholdCents(undefined), 10000)
    assert.equal(resolveFreeShippingThresholdCents(null), 10000)
  })

  it('falls back to the $100 default for a non-numeric or non-positive value', () => {
    assert.equal(resolveFreeShippingThresholdCents('not-a-number'), 10000)
    assert.equal(resolveFreeShippingThresholdCents('0'), 10000)
    assert.equal(resolveFreeShippingThresholdCents('-5'), 10000)
  })
})
