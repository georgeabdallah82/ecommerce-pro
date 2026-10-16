import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dailySummaryMessage, dayLabel, reviewRequestWindow, storeDayKey, yesterdayKey, type DailySummaryFacts } from '@/lib/daily-summary'
import { isInternalJobRequest } from '@/lib/internal-job'
import { validGtin } from '@/lib/product-feed'

const usd = (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`
const facts = (extra: Partial<DailySummaryFacts> = {}): DailySummaryFacts => ({
  storeName: 'Yalla Haul', dayLabel: 'Thursday 16 October', currency: 'USD', ordersYesterday: 3, salesYesterday: 12000,
  toConfirm: 2, toPrepare: 1, outForDelivery: 0, lowStock: [{ name: 'Soap', left: 1 }], pendingReviews: 0, reviewEmailsSent: 0, ...extra,
})

describe('morning summary', () => {
  it('days are the store\'s own (Beirut), not UTC', () => {
    // 05:37 UTC on 17 Oct is 08:37 in Beirut: yesterday is the 16th.
    const now = new Date('2026-10-17T05:37:00Z')
    assert.equal(storeDayKey(now, 'Asia/Beirut'), '2026-10-17')
    assert.equal(yesterdayKey(now, 'Asia/Beirut'), '2026-10-16')
    // 22:30 UTC on the 16th is already the 17th in Beirut.
    assert.equal(storeDayKey(new Date('2026-10-16T22:30:00Z'), 'Asia/Beirut'), '2026-10-17')
    assert.equal(dayLabel(now, 'Asia/Beirut'), 'Friday 16 October')
    assert.equal(storeDayKey(now, 'Not/AZone'), '2026-10-17', 'a mistyped timezone falls back to UTC')
  })
  it('says yesterday\'s orders and sales and what is waiting', () => {
    const m = dailySummaryMessage(facts(), usd)
    assert.equal(m.subject, 'Yalla Haul: yesterday 3 orders · USD 120.00 · 2 to confirm')
    assert.equal(m.push.title, 'Good morning! Yesterday: 3 orders · USD 120.00')
    assert.equal(m.push.body, '2 orders to confirm · 1 order to prepare · 1 product low on stock')
  })
  it('a quiet day reads as one', () => {
    const m = dailySummaryMessage(facts({ ordersYesterday: 0, salesYesterday: 0, toConfirm: 0, toPrepare: 0, lowStock: [] }), usd)
    assert.equal(m.subject, 'Yalla Haul: yesterday no orders')
    assert.equal(m.push.body, 'Nothing waiting for you. Have a good day!')
  })
  it('asks for reviews 20 hours to 5 days after delivery', () => {
    const now = new Date('2026-10-17T05:37:00Z')
    const w = reviewRequestWindow(now)
    assert.equal(w.deliveredBefore.toISOString(), '2026-10-16T09:37:00.000Z')
    assert.equal(w.deliveredAfter.toISOString(), '2026-10-12T05:37:00.000Z')
  })
})

describe('the daily job\'s own request', () => {
  const KEY = Symbol.for('yallahaul.internalJobKey')
  const req = (headers: Record<string, string>) => new Request('https://internal.invalid/api/internal/daily', { method: 'POST', headers })
  it('is accepted only with this Worker\'s key or the cron secret', () => {
    const g = globalThis as Record<symbol, unknown>
    const before = g[KEY]
    const savedSecret = process.env.CRON_SECRET
    try {
      delete g[KEY]
      delete process.env.CRON_SECRET
      assert.equal(isInternalJobRequest(req({ 'x-internal-job': 'anything' })), false, 'no key made yet')
      assert.equal(isInternalJobRequest(req({ 'x-internal-job': '' })), false)
      g[KEY] = 'k'.repeat(72)
      assert.equal(isInternalJobRequest(req({ 'x-internal-job': 'k'.repeat(72) })), true)
      assert.equal(isInternalJobRequest(req({ 'x-internal-job': 'k'.repeat(71) })), false)
      assert.equal(isInternalJobRequest(req({ authorization: 'Bearer ' })), false, 'no cron secret configured')
      process.env.CRON_SECRET = 'cron-secret-value'
      assert.equal(isInternalJobRequest(req({ authorization: 'Bearer cron-secret-value' })), true)
      assert.equal(isInternalJobRequest(req({ authorization: 'Bearer wrong' })), false)
    } finally {
      if (before === undefined) delete g[KEY]; else g[KEY] = before
      if (savedSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret
    }
  })
})

describe('barcodes for Google', () => {
  it('sends only real barcodes (correct check digit)', () => {
    assert.equal(validGtin('4006381333931'), '4006381333931')
    assert.equal(validGtin('0360 0029 1452'), '036000291452')
    assert.equal(validGtin('96385074'), '96385074')
    assert.equal(validGtin('4006381333932'), '', 'wrong check digit')
    assert.equal(validGtin('SKU-123'), '')
    assert.equal(validGtin('00000000'), '')
    assert.equal(validGtin(null), '')
  })
})
