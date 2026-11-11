import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { csvCell, activityCsv } from '../lib/activity-export'
import { activityWhere } from '../lib/activity-query'
import { AUDIT_RETENTION_DAYS } from '../lib/audit-retention'

const read = (path: string) => readFileSync(path, 'utf8')

test('a CSV cell is quoted when it must be, and quotes are doubled', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('Mia, Beirut'), '"Mia, Beirut"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(42), '42')
  assert.equal(csvCell('  padded  '), '"  padded  "')
})

test('text that a spreadsheet would run as a formula gets a leading quote', () => {
  for (const text of ['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tcell']) {
    assert.ok(csvCell(text).includes(`'${text.slice(0, 1)}`) || csvCell(text).startsWith(`"'`), text)
  }
  assert.equal(csvCell('=cmd'), "'=cmd")
})

test('the export has a byte-order mark, a header row and CRLF line endings', () => {
  const csv = activityCsv([{ time: 't', who: 'Mia', email: 'mia@example.test', action: 'order.created', entity: 'Order', entityId: 'o1', details: '{}' }])
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.ok(csv.includes('Time,Who,Email,Action,Entity,Entity ID,Details\r\n'))
  assert.ok(csv.endsWith('\r\n'))
})

test('the list and the export read the same filters', () => {
  assert.deepEqual(activityWhere(new URLSearchParams('actor=system'), 'UTC'), { actorId: null })
  assert.deepEqual(activityWhere(new URLSearchParams('actor=u1&entity=Order'), 'UTC'), { entity: 'Order', actorId: 'u1' })
  assert.equal(activityWhere(new URLSearchParams('q=refund'), 'UTC').OR?.length, 5)
  const dated = activityWhere(new URLSearchParams('from=2026-11-01&to=2026-11-03'), 'UTC') as { createdAt: { gte: Date; lt: Date } }
  assert.ok(dated.createdAt.gte instanceof Date && dated.createdAt.lt instanceof Date)
  assert.deepEqual(activityWhere(new URLSearchParams('from=yesterday'), 'UTC'), {}, 'a bad date is ignored')
})

test('entries older than a year are removed by the daily job, and only those', () => {
  assert.equal(AUDIT_RETENTION_DAYS, 365)
  assert.match(read('lib/audit-retention.ts'), /createdAt: \{ lt: cutoff \}/)
  assert.match(read('app/api/internal/daily/route.ts'), /const activityLog = await pruneAuditLog\(now\)/)
})

test('the export needs activity.view, is audited, caps the file and says when it was cut', () => {
  const route = read('app/api/admin/activity/export/route.ts')
  assert.match(route, /requirePermission\('activity\.view'\)/)
  assert.match(route, /MAX_ROWS = 10_000/)
  assert.match(route, /audit\(actor\.id, 'activity\.exported'/)
  assert.match(route, /'X-Truncated': 'true'/)
  assert.match(route, /Content-Disposition/)
})
