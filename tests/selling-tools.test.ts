import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatLbp, freeGiftConfig, freeGiftProgress, lbpAmount, lbpConfig, welcomeConfig } from '@/lib/selling'
import { countdown, saleFor, salePrice } from '@/lib/flash-sale-shared'
import { distance, normalize, searchDocs } from '@/lib/smart-search'

describe('prices in Lebanese pounds', () => {
  it('is on only with a rate, and rounds to 1,000 LBP', () => {
    assert.deepEqual(lbpConfig({ 'currency.showLbp': 'true', 'currency.lbpRate': '89,500' }), { show: true, rate: 89500 })
    assert.equal(lbpConfig({ 'currency.showLbp': 'true', 'currency.lbpRate': '' }).show, false)
    assert.equal(lbpConfig({ 'currency.showLbp': 'false', 'currency.lbpRate': '89500' }).show, false)
    assert.equal(lbpAmount(1000, 89500), 895000)
    assert.equal(lbpAmount(1250, 89500), 1119000, '$12.50 = 1,118,750 -> 1,119,000')
    assert.equal(formatLbp(895000), '895,000 LBP')
    assert.equal(lbpAmount(1000, 0), 0)
  })
})

describe('free gift above an amount', () => {
  it('needs the switch, an amount and a product', () => {
    assert.deepEqual(freeGiftConfig({ 'freeGift.enabled': 'true', 'freeGift.threshold': '50', 'freeGift.productId': 'p1' }), { enabled: true, threshold: 5000, productId: 'p1' })
    assert.equal(freeGiftConfig({ 'freeGift.enabled': 'true', 'freeGift.threshold': '50', 'freeGift.productId': '' }).enabled, false)
    assert.equal(freeGiftConfig({ 'freeGift.enabled': 'true', 'freeGift.threshold': '', 'freeGift.productId': 'p1' }).enabled, false)
  })
  it('tells the shopper how far they are', () => {
    assert.deepEqual(freeGiftProgress(3000, 5000), { reached: false, remaining: 2000, percent: 60 })
    assert.deepEqual(freeGiftProgress(5000, 5000), { reached: true, remaining: 0, percent: 100 })
    assert.deepEqual(freeGiftProgress(9000, 5000), { reached: true, remaining: 0, percent: 100 })
  })
})

describe('welcome discount', () => {
  it('is on only with a code; the delay has a sensible default', () => {
    assert.deepEqual(welcomeConfig({ 'welcome.enabled': 'true', 'welcome.code': ' welcome10 ' }), { enabled: true, code: 'WELCOME10', title: '', delaySeconds: 8 })
    assert.equal(welcomeConfig({ 'welcome.enabled': 'true', 'welcome.code': '' }).enabled, false)
    assert.equal(welcomeConfig({ 'welcome.enabled': 'true', 'welcome.code': 'X', 'welcome.delaySeconds': '500' }).delaySeconds, 120)
  })
})

describe('flash sale', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const sales = [
    { id: 'a', percent: 20, endsAt: '2026-10-16T14:00:00Z', all: false, productIds: ['p1'] },
    { id: 'b', percent: 30, endsAt: '2026-10-17T12:00:00Z', all: false, productIds: ['p1', 'p2'] },
    { id: 'c', percent: 50, endsAt: '2026-10-16T11:00:00Z', all: true, productIds: [] },
  ]
  it('picks the best running sale for a product; ended ones never count', () => {
    assert.equal(saleFor(sales, 'p1', now)?.id, 'b')
    assert.equal(saleFor(sales, 'p3', now), null, 'the all-products sale has ended')
    assert.equal(saleFor([{ ...sales[2], endsAt: '2026-10-18T00:00:00Z' }], 'p3', now)?.percent, 50)
  })
  it('prices and counts down like checkout does', () => {
    assert.equal(salePrice(1000, 20), 800)
    assert.equal(salePrice(999, 15), 850, 'the discount is rounded down, as at checkout')
    assert.equal(countdown('2026-10-16T14:05:09Z', now), '02:05:09')
    assert.equal(countdown('2026-10-18T13:00:00Z', now), '2d 01:00:00')
    assert.equal(countdown('2026-10-16T11:00:00Z', now), '00:00:00')
  })
})

describe('forgiving search', () => {
  const docs = [
    { id: 'tissue', fields: [{ text: 'Baloo Tissue Box 200 sheets', weight: 3 }, { text: 'Home Goods', weight: 2 }] },
    { id: 'soap', fields: [{ text: 'Aleppo Olive Soap', weight: 3 }, { text: 'Personal Care', weight: 2 }] },
    { id: 'cologne', fields: [{ text: '4711 Eau de Cologne', weight: 3 }, { text: 'Personal Care', weight: 2 }] },
  ]
  it('finds products despite small typos', () => {
    assert.deepEqual(searchDocs('tisue', docs), ['tissue'])
    assert.deepEqual(searchDocs('colone', docs), ['cologne'])
    assert.deepEqual(searchDocs('home tisue', docs), ['tissue'])
    assert.deepEqual(searchDocs('xyz', docs), [])
  })
  it('uses the store word list (Arabizi) and Arabic spelling variants', () => {
    assert.deepEqual(searchDocs('sabon', docs, 'soap = sabon, saboun'), ['soap'])
    assert.equal(normalize('أحمد إسلام آمنة'), normalize('احمد اسلام امنه'))
    assert.equal(normalize('مستشفى'), normalize('مستشفي'))
  })
  it('counts a swapped pair of letters as one typo', () => {
    assert.equal(distance('tsisue', 'tissue', 2), 1)
    assert.equal(distance('abc', 'xyz', 1), 2)
  })
})
