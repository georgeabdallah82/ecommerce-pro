import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { cleanInfluencerCode, commissionFor, influencerMessage, orderValue, suggestInfluencerCode, summarizeInfluencer, validateInfluencer, validatePayout, type OrderForCommission } from '@/lib/influencers-shared'

const read = (path: string) => readFileSync(path, 'utf8')
const order = (status: string, extra: Partial<OrderForCommission> = {}): OrderForCommission => ({ status, subtotal: 10000, discountTotal: 1000, grandTotal: 14000, refunded: 0, ...extra })

describe('influencer codes: the code and the form', () => {
  it('a code is capitals and numbers only', () => {
    assert.equal(cleanInfluencerCode(' maya-10! '), 'MAYA10')
    assert.equal(cleanInfluencerCode(null), '')
    assert.equal(cleanInfluencerCode('a'.repeat(40)).length, 20)
  })

  it('suggests a code from the first name and the discount', () => {
    assert.equal(suggestInfluencerCode('Maya Haddad', 10), 'MAYA10')
    assert.equal(suggestInfluencerCode('Maya', 0), 'MAYA')
    assert.equal(suggestInfluencerCode('مايا', 10), '') // the owner types one when the name has no Latin letters
  })

  it('accepts a good form and tidies it', () => {
    const r = validateInfluencer({ name: '  Maya   Haddad ', handle: '@maya', phone: '70 123 456', code: 'maya10', customerPercent: '10', commissionPercent: 15, notes: ' vip ' })
    assert.deepEqual(r, { ok: true, value: { name: 'Maya Haddad', handle: '@maya', phone: '70 123 456', code: 'MAYA10', customerPercent: 10, commissionPercent: 15, notes: 'vip' } })
  })

  it('refuses what cannot work, with a plain sentence', () => {
    const base = { name: 'Maya', code: 'MAYA10', customerPercent: 10, commissionPercent: 10 }
    const bad = (patch: Record<string, unknown>) => { const r = validateInfluencer({ ...base, ...patch }); return r.ok ? '' : r.error }
    assert.match(bad({ name: '  ' }), /name/)
    assert.match(bad({ customerPercent: 0 }), /discount/)
    assert.match(bad({ customerPercent: 60 }), /discount/)
    assert.match(bad({ customerPercent: 10.5 }), /discount/)
    assert.match(bad({ commissionPercent: -1 }), /commission/)
    assert.match(bad({ commissionPercent: 80 }), /commission/)
    assert.match(bad({ code: 'AB' }), /code/)
    assert.match(bad({ phone: '12' }), /WhatsApp/)
    assert.equal(bad({ commissionPercent: 0 }), '') // an influencer with no commission is fine
    assert.equal(bad({ code: '' }) !== '', true)
    assert.equal(validateInfluencer({ ...base, code: '' }, { requireCode: false }).ok, true) // editing: the code is not sent
  })
})

describe('influencer codes: what they earn', () => {
  it('earns on the goods after the discount, not on delivery or tax', () => {
    assert.equal(orderValue(order('DELIVERED')), 9000)
    assert.equal(commissionFor(9000, 10), 900)
    assert.equal(commissionFor(9005, 10), 901) // rounded to the cent
    assert.equal(commissionFor(-5, 10), 0)
  })

  it('a refund takes its share off', () => {
    assert.equal(orderValue(order('DELIVERED', { refunded: 7000 })), 4500) // half of 14000 refunded: half of 9000
    assert.equal(orderValue(order('DELIVERED', { refunded: 99999 })), 0)
  })

  it('only delivered orders are earned; orders on their way are "waiting"; cancelled and refunded orders count for nothing', () => {
    const s = summarizeInfluencer([order('DELIVERED'), order('DELIVERED'), order('SHIPPED'), order('PENDING'), order('CANCELLED'), order('REFUNDED')], 10, 0)
    assert.deepEqual(s, { orders: 4, delivered: 2, sales: 18000, waitingSales: 18000, earned: 1800, waiting: 1800, paid: 0, owed: 1800, overpaid: 0 })
  })

  it('what you owe is what they earned minus what you paid, and never goes below zero', () => {
    const delivered = [order('DELIVERED'), order('DELIVERED')]
    assert.equal(summarizeInfluencer(delivered, 10, 500).owed, 1300)
    assert.equal(summarizeInfluencer(delivered, 10, 1800).owed, 0)
    const over = summarizeInfluencer(delivered, 10, 2500)
    assert.deepEqual({ owed: over.owed, overpaid: over.overpaid }, { owed: 0, overpaid: 700 })
    assert.deepEqual(summarizeInfluencer([], 10, 0), { orders: 0, delivered: 0, sales: 0, waitingSales: 0, earned: 0, waiting: 0, paid: 0, owed: 0, overpaid: 0 })
  })

  it('a payment is a positive whole number of cents', () => {
    assert.deepEqual(validatePayout({ amount: 1250, note: ' cash ' }), { ok: true, amount: 1250, note: 'cash' })
    for (const amount of [0, -5, 12.5, '12', NaN, null, 1e12]) assert.equal(validatePayout({ amount }).ok, false, String(amount))
  })

  it('the WhatsApp message gives the code, the discount and the commission', () => {
    const text = influencerMessage({ storeName: 'Yalla Haul', name: 'Maya Haddad', code: 'MAYA10', customerPercent: 10, commissionPercent: 15, siteUrl: 'https://yallahaul.com' })
    assert.match(text, /^Hi Maya! Your code at Yalla Haul is MAYA10\./)
    assert.match(text, /10% off/)
    assert.match(text, /yallahaul\.com/)
    assert.match(text, /15% on every order that is delivered/)
    assert.doesNotMatch(influencerMessage({ storeName: '', name: '', code: 'X1', customerPercent: 5, commissionPercent: 0, siteUrl: '' }), /earn/)
  })
})

describe('influencer codes: how it is wired', () => {
  it('adds two new tables and changes nothing that exists', () => {
    const sql = read('prisma/migrations/20261024000000_influencer_codes/migration.sql')
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map(m => m[1]), ['Influencer', 'InfluencerPayout'])
    assert.doesNotMatch(sql.replace(/^--.*$/gm, '').replace(/ON (DELETE|UPDATE) CASCADE/g, ''), /DROP |DELETE |UPDATE |TRUNCATE /)
    assert.deepEqual([...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map(m => m[1]), ['InfluencerPayout']) // only the link between the two new tables
  })

  it('the code is a normal discount made together with the influencer, and never clashes with another code', () => {
    const lib = read('lib/influencers.ts')
    assert.match(lib, /tx\.coupon\.create\(\{ data: \{ code: input\.code, type: 'PERCENTAGE', value: input\.customerPercent, isActive: true \} \}\)/)
    assert.match(lib, /tx\.coupon\.findUnique[\s\S]*tx\.inviteCode\.findUnique[\s\S]*tx\.influencer\.findUnique/)
    assert.match(lib, /updateMany\(\{ where: \{ code: current\.code \}, data: \{ value: input\.customerPercent, isActive \} \}\)/)
  })

  it('an influencer with orders or payments cannot be removed', () => {
    const lib = read('lib/influencers.ts')
    assert.match(lib, /if \(orders \|\| payouts\) throw new Error\(/)
  })

  it('every change needs the discounts permission and is written to the history', () => {
    for (const path of ['app/api/admin/influencers/route.ts', 'app/api/admin/influencers/payouts/route.ts']) {
      const source = read(path)
      assert.equal((source.match(/requirePermission\('coupons\.manage'\)/g) || []).length, (source.match(/export async function/g) || []).length, path)
      assert.equal((source.match(/await audit\(/g) || []).length, (source.match(/export async function/g) || []).length, path)
    }
    assert.match(read('app/admin/marketing/influencers/page.tsx'), /requirePermission\('coupons\.view'\)/)
  })

  it('is in the Marketing menu', () => {
    assert.match(read('app/admin/layout.tsx'), /href: '\/admin\/marketing\/influencers', label: 'Influencers', permission: 'coupons\.view', icon: 'influencers'/)
    assert.match(read('components/admin-nav.tsx'), /influencers: Star/)
  })

  it('the launch clean-up wipes test payments but keeps the influencers and their codes', () => {
    const source = read('scripts/launch-cleanup.mjs')
    assert.match(source, /'InfluencerPayout'/)
    assert.doesNotMatch(source, /DELETE FROM "Influencer"|'Influencer'[,\]]/)
  })

  it('numbers typed in the forms do not jump around while typing', () => {
    const view = read('components/influencers-admin.tsx')
    assert.match(view, /import \{ NumInput \} from '@\/components\/num-input'/)
    assert.doesNotMatch(view, /type="number"/)
  })
})
