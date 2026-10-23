import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatDuration, funnelToday, hourlyCounts, onlineSummary, pagesPerVisit, percent, topCounts } from '../lib/visitor-stats'
import { startOfStoreDay, storeHourOf } from '../lib/store-day'
import { readVisit, sourceTags } from '../lib/visit-input'

test('percent is whole, safe with zero, and never above 100', () => {
  assert.equal(percent(1, 3), 33)
  assert.equal(percent(2, 3), 67)
  assert.equal(percent(5, 5), 100)
  assert.equal(percent(9, 5), 100)
  assert.equal(percent(0, 10), 0)
  assert.equal(percent(5, 0), 0)
  assert.equal(percent(-2, 10), 0)
})

test('time on the store in plain words', () => {
  assert.equal(formatDuration(0), '0 s')
  assert.equal(formatDuration(45_000), '45 s')
  assert.equal(formatDuration(60_000), '1 min')
  assert.equal(formatDuration(5 * 60_000 + 59_000), '5 min')
  assert.equal(formatDuration(65 * 60_000), '1 h 05 min')
  assert.equal(formatDuration(-5000), '0 s')
})

test('visitors by hour of the store day', () => {
  // Asia/Dubai is UTC+4 all year round.
  const hours = hourlyCounts(['2026-10-23T20:10:00Z', '2026-10-23T20:50:00Z', '2026-10-23T08:00:00Z', 'not a date', new Date('2026-10-23T19:59:00Z')], 'Asia/Dubai')
  assert.equal(hours.length, 24)
  assert.equal(hours[0], 2)   // 00:10 and 00:50 Dubai
  assert.equal(hours[12], 1)  // 12:00 Dubai
  assert.equal(hours[23], 1)  // 23:59 Dubai
  assert.equal(hours.reduce((a, b) => a + b, 0), 4)
})

test('group and count: biggest first, ties by name, the rest joined as Others', () => {
  assert.deepEqual(topCounts(['b', 'a', 'a', 'c', 'b', 'a'], 5), [{ key: 'a', count: 3 }, { key: 'b', count: 2 }, { key: 'c', count: 1 }])
  assert.deepEqual(topCounts(['x', 'y'], 5), [{ key: 'x', count: 1 }, { key: 'y', count: 1 }])
  assert.deepEqual(topCounts(['a', 'a', 'b', 'c', 'd', 'e'], 3), [{ key: 'a', count: 2 }, { key: 'b', count: 1 }, { key: 'Others', count: 3 }])
  assert.deepEqual(topCounts([null, '', ' ', 'x'], 5, 'direct'), [{ key: 'direct', count: 3 }, { key: 'x', count: 1 }])
  assert.deepEqual(topCounts([], 5), [])
})

test('online now: by step, with carts', () => {
  const s = onlineSummary([
    { stage: 'browsing', cartItems: 0, cartValue: 0 },
    { stage: 'product', cartItems: 2, cartValue: 3000 },
    { stage: 'cart', cartItems: 1, cartValue: 1500 },
    { stage: 'checkout', cartItems: 3, cartValue: 9000 },
    { stage: 'checkout', cartItems: 0, cartValue: 0 },
  ])
  assert.equal(s.online, 5)
  assert.deepEqual(s.byStage, { browsing: 1, product: 1, cart: 1, checkout: 2, ordered: 0 })
  assert.equal(s.withCart, 3)
  assert.equal(s.cartValue, 13500)
  assert.deepEqual(onlineSummary([]), { online: 0, byStage: { browsing: 0, product: 0, cart: 0, checkout: 0, ordered: 0 }, withCart: 0, cartValue: 0 })
})

test("today's funnel: how many visits got as far as each step", () => {
  const rows = funnelToday([0, 0, 0, 0, 1, 1, 2, 3, 4, 0])
  assert.deepEqual(rows.map(r => [r.stage, r.count]), [['browsing', 10], ['product', 5], ['cart', 3], ['checkout', 2], ['ordered', 1]])
  assert.deepEqual(rows.map(r => r.ofAll), [100, 50, 30, 20, 10])
  assert.deepEqual(rows.map(r => r.ofPrevious), [100, 50, 60, 67, 50])
  assert.deepEqual(funnelToday([]).map(r => r.count), [0, 0, 0, 0, 0])
  assert.deepEqual(funnelToday([]).map(r => r.ofAll), [0, 0, 0, 0, 0])
})

test('pages per visit', () => {
  assert.equal(pagesPerVisit(10, 4), '2.5')
  assert.equal(pagesPerVisit(7, 3), '2.3')
  assert.equal(pagesPerVisit(0, 0), '-')
})

test('"today" starts at midnight in the store timezone', () => {
  // Dubai (UTC+4, no summer time): 2026-10-23 12:00 UTC is 16:00 there, so the day began 2026-10-22 20:00 UTC.
  assert.equal(startOfStoreDay(new Date('2026-10-23T12:00:00Z'), 'Asia/Dubai').toISOString(), '2026-10-22T20:00:00.000Z')
  assert.equal(startOfStoreDay(new Date('2026-10-23T19:59:59Z'), 'Asia/Dubai').toISOString(), '2026-10-22T20:00:00.000Z')
  assert.equal(startOfStoreDay(new Date('2026-10-23T20:00:00Z'), 'Asia/Dubai').toISOString(), '2026-10-23T20:00:00.000Z')
  assert.equal(startOfStoreDay(new Date('2026-10-23T12:00:00Z'), 'UTC').toISOString(), '2026-10-23T00:00:00.000Z')
  // New York is UTC-4 in summer time and UTC-5 after it ends (2026-11-01).
  assert.equal(startOfStoreDay(new Date('2026-07-15T12:00:00Z'), 'America/New_York').toISOString(), '2026-07-15T04:00:00.000Z')
  assert.equal(startOfStoreDay(new Date('2026-12-15T12:00:00Z'), 'America/New_York').toISOString(), '2026-12-15T05:00:00.000Z')
  // The day the clocks go back is 25 hours long: midnight is still at the summer offset.
  assert.equal(startOfStoreDay(new Date('2026-11-01T18:00:00Z'), 'America/New_York').toISOString(), '2026-11-01T04:00:00.000Z')
  assert.equal(startOfStoreDay(new Date('2026-10-23T12:00:00Z'), 'Not/AZone').toISOString(), '2026-10-23T00:00:00.000Z')
  assert.equal(storeHourOf(new Date('2026-10-23T20:30:00Z'), 'Asia/Dubai'), 0)
  assert.equal(storeHourOf(new Date('2026-10-23T20:30:00Z'), 'Not/AZone'), 20)
})

test('the page report is read defensively', () => {
  const v = readVisit({ kind: 'view', path: '/product/tissue?x=1', referrer: 'https://l.instagram.com/', tags: '?utm_source=ig&secret=1&fbclid=abc', cartItems: 2.9, cartValue: 4500 })
  assert.equal(v.kind, 'view')
  assert.equal(v.path, '/product/tissue')
  assert.equal(v.referrer, 'https://l.instagram.com/')
  assert.equal(v.landing, '/?utm_source=ig&fbclid=abc')
  assert.equal(v.cartItems, 2)
  assert.equal(v.cartValue, 4500)
  for (const junk of [null, undefined, 'x', 5, [], { kind: 'bogus', path: 7, cartItems: 'abc', cartValue: -9 }]) {
    const d = readVisit(junk)
    assert.equal(d.kind, 'view')
    assert.equal(d.path, '/')
    assert.equal(d.cartItems, 0)
    assert.equal(d.cartValue, 0)
    assert.equal(d.landing, null)
  }
  assert.equal(readVisit({ kind: 'ping' }).kind, 'ping')
  assert.equal(readVisit({ kind: 'leave' }).kind, 'leave')
  assert.equal(readVisit({ cartItems: 1e9 }).cartItems, 999)
})

test('only link tags that say where a visitor came from are kept', () => {
  assert.equal(sourceTags('?utm_source=newsletter&utm_medium=email&token=abc&order=1001'), 'utm_source=newsletter&utm_medium=email')
  assert.equal(sourceTags('?gclid=1&ttclid=2&igshid=3&fbclid=4'), 'fbclid=4&igshid=3&gclid=1&ttclid=2')
  assert.equal(sourceTags('?foo=bar'), '')
  assert.equal(sourceTags(null), '')
  assert.equal(sourceTags('?utm_source=' + 'x'.repeat(200)).length, 'utm_source='.length + 40)
})

const read = (path: string) => readFileSync(path, 'utf8')

test('privacy: no IP address and no GPS are stored, only a place rounded to about 10 km, and the old map table is gone', () => {
  const schema = read('prisma/schema.prisma')
  const model = schema.slice(schema.indexOf('model VisitorSession'), schema.indexOf('model RateLimitBucket'))
  assert.ok(model.includes('model VisitorPageView'))
  assert.ok(!/ipAddress|latitude|longitude|isp\b|accuracy/i.test(model), 'no address, GPS fields or accuracy in the tables')
  assert.match(model, /placeLat\s+Float\?/)
  assert.ok(!schema.includes('LiveVisitorSession'))
  const record = read('lib/visitors.ts') + read('app/api/analytics/visit/route.ts')
  assert.ok(!/ipAddress/.test(record), 'recording code never mentions an IP address')
  assert.match(read('lib/visitors.ts'), /roundPlace\(cf\.latitude, cf\.longitude\)/)
  assert.ok(!/body\??\.(latitude|longitude|lat|lng)|input\.(latitude|longitude|lat|lng)/.test(record), 'a visitor\'s own browser never sends coordinates')
})

test('wiring: the tracker is on the store, the route skips staff and robots, the report is staff-only', () => {
  assert.match(read('app/layout.tsx'), /<VisitorTracker\/>/)
  const route = read('app/api/analytics/visit/route.ts')
  assert.match(route, /isStaffUser\(user\)/)
  assert.match(route, /isTrackedPath\(input\.path\)/)
  assert.match(read('lib/visitors.ts'), /if \(agent\.bot\) return null/)
  assert.match(read('app/api/admin/visitors/route.ts'), /requirePermission\('reports\.view'\)/)
  assert.match(read('app/admin/live-visitors/page.tsx'), /requirePermission\('reports\.view'\)/)
  assert.match(read('app/api/internal/daily/route.ts'), /pruneVisitorData\(now\)/)
})
