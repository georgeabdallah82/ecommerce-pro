import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { capRows, cappedJson, reportRows, LIST_CAP } from '../lib/admin-list'
import { UserError } from '../lib/user-error'

const read = (path: string) => readFileSync(path, 'utf8')

test('a list at or under its cap is returned whole', () => {
  assert.deepEqual(capRows([1, 2, 3], 3), { rows: [1, 2, 3], truncated: false })
  assert.deepEqual(capRows([], 3), { rows: [], truncated: false })
})

test('a list one row past its cap is cut to the cap and says so', () => {
  assert.deepEqual(capRows([1, 2, 3, 4], 3), { rows: [1, 2, 3], truncated: true })
})

test('cappedJson keeps the array shape and sets X-Truncated', async () => {
  const cut = cappedJson([1, 2, 3, 4], 3)
  assert.equal(cut.headers.get('X-Truncated'), 'true')
  assert.deepEqual(await cut.json(), [1, 2, 3])

  const whole = cappedJson([1, 2], 3)
  assert.equal(whole.headers.get('X-Truncated'), 'false')
  assert.deepEqual(await whole.json(), [1, 2])
})

test('cappedJson keeps the headers a route passes in', () => {
  const reply = cappedJson([], LIST_CAP, { headers: { 'Cache-Control': 'private, no-store' } })
  assert.equal(reply.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(reply.headers.get('X-Truncated'), 'false')
})

test('a report over its cap is refused with a 413 and a code, not cut', () => {
  assert.deepEqual(reportRows([1, 2], 2, 'too many'), [1, 2])
  assert.throws(
    () => reportRows([1, 2, 3], 2, 'Choose a shorter period.'),
    (error: unknown) => error instanceof UserError && error.status === 413 && error.code === 'REPORT_TOO_LARGE' && error.message === 'Choose a shorter period.',
  )
})

// The routes below return lists. Each must fetch one row past its cap and reply through the
// helper, so a long list is cut and flagged rather than sent in full.
const CAPPED_LISTS = [
  'app/api/admin/fulfillments/route.ts',
  'app/api/admin/pages/route.ts',
  'app/api/admin/redirects/route.ts',
  'app/api/admin/sales-channels/route.ts',
  'app/api/admin/sales-channels/publications/route.ts',
  'app/api/admin/locations/route.ts',
  'app/api/admin/metafields/route.ts',
  'app/api/admin/settings/route.ts',
  'app/api/admin/shipping/route.ts',
  'app/api/admin/tax-rates/route.ts',
  'app/api/admin/webhooks/route.ts',
  'app/api/admin/api-credentials/route.ts',
  'app/api/admin/blog-posts/route.ts',
  'app/api/admin/customers/segments/route.ts',
  'app/api/admin/customers/tags/route.ts',
  'app/api/admin/products/prices/route.ts',
  'app/api/admin/users/route.ts',
]

test('every capped list fetches one row past its cap and replies through the helper', () => {
  for (const file of CAPPED_LISTS) {
    const source = read(file)
    assert.match(source, /take:\s*(LIST_CAP|TAG_CAP)\s*\+\s*1/, `${file} must fetch one row past its cap`)
    assert.match(source, /cappedJson\(|capRows\(/, `${file} must reply through the cap helper`)
  }
})

test('the report routes refuse an oversized period instead of cutting it', () => {
  const reports: [string, RegExp[]][] = [
    ['app/api/admin/reports/route.ts', [/take:\s*REPORT_ORDER_CAP\s*\+\s*1/, /take:\s*REPORT_INVENTORY_CAP\s*\+\s*1/, /reportRows\(orderRows/, /reportRows\(inventoryRows/]],
    ['app/api/admin/analytics/route.ts', [/take:\s*REPORT_ORDER_CAP\s*\+\s*1/, /take:\s*REPORT_CUSTOMER_CAP\s*\+\s*1/, /take:\s*REPORT_INVENTORY_CAP\s*\+\s*1/, /reportRows\(orderRows/, /reportRows\(customerRows/, /reportRows\(inventoryRows/]],
    ['app/api/admin/analytics/discounts/route.ts', [/take:\s*REPORT_ORDER_CAP\s*\+\s*1/, /reportRows\(await db\.order\.findMany/]],
  ]
  for (const [file, patterns] of reports) {
    const source = read(file)
    for (const pattern of patterns) assert.match(source, pattern, `${file} must match ${pattern}`)
    // The catch block turns the refusal into its status and code rather than a 401.
    assert.match(source, /if \(error instanceof UserError\) return json\(\{ error: error\.message, code: error\.code \}, \{ status: error\.status \}\)/, `${file} must answer the refusal with its status`)
  }
})

test('staff roles are counted in the database, not by loading every staff row', () => {
  const source = read('app/api/admin/roles/route.ts')
  const start = source.indexOf('async function withCounts')
  assert.ok(start >= 0, 'withCounts exists')
  const body = source.slice(start, source.indexOf('\n}\n', start))
  assert.match(body, /db\.user\.groupBy\(\{ by: \['staffRoleId'\]/)
  assert.doesNotMatch(body, /findMany/)
})
