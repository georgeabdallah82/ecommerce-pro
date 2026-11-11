import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('low stock is counted in the database, and only the four lowest rows come back', () => {
  const data = read('lib/admin-dashboard-data.ts')
  assert.match(data, /SELECT COUNT\(\*\)::int AS count[\s\S]*WHERE i\.quantity - i\.reserved <= i\."lowStockThreshold"/)
  assert.match(data, /ORDER BY \(i\.quantity - i\.reserved\) ASC\s+LIMIT 4/)
  assert.doesNotMatch(read('app/admin/page.tsx'), /inventoryItem\.findMany/, 'the dashboard no longer reads every inventory row')
})

test('the aggregate reads are cached for a minute, keyed by timezone and month window', () => {
  const data = read('lib/admin-dashboard-data.ts')
  assert.match(data, /const CACHE_SECONDS = 60/)
  assert.match(data, /unstable_cache\(readAggregates, \['admin-dashboard-aggregates'\], \{ revalidate: CACHE_SECONDS \}\)\(timezone, monthFrom\.toISOString\(\)\)/)
  const page = read('app/admin/page.tsx')
  assert.match(page, /getDashboardAggregates\(timezone, monthStartDay\)/)
})

test('live figures are still read on every visit: visitors, the newest orders and the activity log', () => {
  const page = read('app/admin/page.tsx')
  assert.match(page, /visitorCounts\(now\)/)
  assert.match(page, /db\.order\.findMany\(\{ orderBy: \{ createdAt: 'desc' \}, take: 6/)
  assert.match(page, /db\.auditLog\.findMany\(\{ orderBy: \{ createdAt: 'desc' \}, take: 8/)
  assert.doesNotMatch(page, /netSales|db\.\$queryRaw/, 'the sales arithmetic and the month query live with the cached reads')
})

test('the cached result holds plain values, so the dates it was built from are turned into day keys before caching', () => {
  const data = read('lib/admin-dashboard-data.ts')
  assert.match(data, /daily: \[\.\.\.salesByDay\]\.map\(\(\[day, entry\]\) => \(\{ day, orders: entry\.orders, net: entry\.net \}\)\)/)
  assert.match(data, /const day = dayKey\(order\.createdAt\)/)
})
