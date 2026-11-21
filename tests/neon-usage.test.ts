import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { endpointIdFromUrl, keptReadings, main, recentReading, usageReport } from '../scripts/neon-usage'

test('the compute id comes from the pooled or direct connection string', () => {
  assert.equal(endpointIdFromUrl('postgresql://u:p@ep-cool-sun-a1b2c3-pooler.eu-central-1.aws.neon.tech/db?sslmode=require'), 'ep-cool-sun-a1b2c3')
  assert.equal(endpointIdFromUrl('postgresql://u:p@ep-cool-sun-a1b2c3.eu-central-1.aws.neon.tech/db'), 'ep-cool-sun-a1b2c3')
})

const period = { periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-11-01T00:00:00Z', limitHours: 100, warnAtPercent: 70 }

test('quiet usage is within the allowance', () => {
  const r = usageReport({ ...period, computeSeconds: 20 * 3600, now: new Date('2026-10-16T00:00:00Z') })
  assert.equal(r.warn, false)
  assert.equal(Math.round(r.usedHours), 20)
  assert.equal(Math.round(r.projectedHours ?? 0), 41)
})

test('warns once 70% of the hours are used', () => {
  const r = usageReport({ ...period, computeSeconds: 71 * 3600, now: new Date('2026-10-28T00:00:00Z') })
  assert.equal(r.warn, true)
  assert.match(r.reason, /71% of the monthly 100 database hours/)
})

test('warns early when the pace would run out before the month ends', () => {
  const r = usageReport({ ...period, computeSeconds: 30 * 3600, now: new Date('2026-10-08T00:00:00Z') })
  assert.equal(r.warn, true)
  assert.match(r.reason, /run out before the month ends/)
})

test('does not judge the pace in the first days of the month', () => {
  const r = usageReport({ ...period, computeSeconds: 10 * 3600, now: new Date('2026-10-02T00:00:00Z') })
  assert.equal(r.warn, false)
})

test('still checks the share used when Neon reports no billing period', () => {
  assert.equal(usageReport({ computeSeconds: 80 * 3600, now: new Date(), limitHours: 100, warnAtPercent: 70 }).warn, true)
  assert.equal(usageReport({ computeSeconds: 10 * 3600, now: new Date(), limitHours: 100, warnAtPercent: 70 }).projectedHours, null)
})

test('finds the project of the store among several and reports its hours', async () => {
  const saved = { fetch: globalThis.fetch, log: console.log, env: { ...process.env }, exitCode: process.exitCode }
  const lines: string[] = []
  const asked: string[] = []
  try {
    process.env.NEON_API_KEY = 'key'
    process.env.NEON_DATABASE_URL = 'postgresql://u:p@ep-store-1-pooler.eu.aws.neon.tech/db'
    delete process.env.GITHUB_STEP_SUMMARY
    console.log = (...a: unknown[]) => { lines.push(a.join(' ')) }
    globalThis.fetch = (async (url: string) => {
      const path = new URL(url).pathname.replace('/api/v2', '')
      asked.push(path)
      const body = path === '/projects' ? { projects: [{ id: 'other' }, { id: 'store' }] }
        : path === '/projects/other/endpoints' ? { endpoints: [{ id: 'ep-other-9' }] }
        : path === '/projects/store/endpoints' ? { endpoints: [{ id: 'ep-store-1' }] }
        : path === '/projects/store' ? { project: { id: 'store', compute_time_seconds: 92 * 3600, active_time_seconds: 300 * 3600, consumption_period_start: '2026-10-01T00:00:00Z', consumption_period_end: '2026-11-01T00:00:00Z' } }
        : null
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 })
    }) as typeof fetch
    process.exitCode = 0
    await main()
    assert.equal(process.exitCode, 1)
    assert.ok(asked.includes('/projects/store'))
    assert.ok(lines.some(l => l.includes('92.0 of 100 (92%)')), lines.join('\n'))
    assert.ok(lines.some(l => l.startsWith('::error::92% of the monthly 100 database hours')))
  } finally {
    globalThis.fetch = saved.fetch
    console.log = saved.log
    process.env = saved.env
    process.exitCode = saved.exitCode
  }
})

test('lists the projects of each organization when Neon wants an organization named', async () => {
  const saved = { fetch: globalThis.fetch, log: console.log, env: { ...process.env }, exitCode: process.exitCode }
  const lines: string[] = []
  try {
    process.env.NEON_API_KEY = 'key'
    process.env.NEON_DATABASE_URL = 'postgresql://u:p@ep-store-1.eu.aws.neon.tech/db'
    delete process.env.GITHUB_STEP_SUMMARY
    console.log = (...a: unknown[]) => { lines.push(a.join(' ')) }
    globalThis.fetch = (async (url: string) => {
      const u = new URL(url)
      const path = u.pathname.replace('/api/v2', '')
      const org = u.searchParams.get('org_id')
      if (path === '/projects' && !org) return new Response(JSON.stringify({ code: '', message: 'org_id is required' }), { status: 400 })
      const body = path === '/users/me/organizations' ? { organizations: [{ id: 'org-a' }, { id: 'org-b' }] }
        : path === '/projects' && org === 'org-a' ? { projects: [] }
        : path === '/projects' && org === 'org-b' ? { projects: [{ id: 'store' }] }
        : path === '/projects/store/endpoints' ? { endpoints: [{ id: 'ep-store-1' }] }
        : path === '/projects/store' ? { project: { id: 'store', compute_time_seconds: 12 * 3600, consumption_period_start: '2026-10-01T00:00:00Z', consumption_period_end: '2026-11-01T00:00:00Z' } }
        : null
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 })
    }) as typeof fetch
    process.exitCode = 0
    await main()
    assert.equal(process.exitCode, 0)
    assert.ok(lines.some(l => l.includes('12.0 of 100 (12%)')), lines.join('\n'))
  } finally {
    globalThis.fetch = saved.fetch
    console.log = saved.log
    process.env = saved.env
    process.exitCode = saved.exitCode
  }
})

// The pace from the last days (docs/hours-check-pace-2026-11.md): November 2026 as it happened. 71.2 hours were used
// on the 20th at 14:14, the day a fix halved what kept the database awake; 72.9 a day later.
const november = { periodStart: '2026-11-01T00:00:00Z', periodEnd: '2026-12-01T00:00:00Z', limitHours: 100, warnAtPercent: 90 }
const yesterday = { at: '2026-11-20T14:14:00Z', usedHours: 71.2, periodStart: '2026-11-01T00:00:00Z' }

test('the pace of the last days counts, so a fix shows within days', () => {
  const now = new Date('2026-11-21T13:42:00Z')
  const r = usageReport({ ...november, computeSeconds: 72.9 * 3600, now, earlier: [yesterday] })
  assert.equal(r.warn, false, r.reason)
  assert.equal(r.pace?.recent, true)
  assert.equal(r.pace?.perDay.toFixed(1), '1.7')
  assert.equal(Math.round(r.projectedHours ?? 0), 89)
  // The month's average alone (no earlier reading) said about 106 and warned every day.
  const average = usageReport({ ...november, warnAtPercent: 70, computeSeconds: 72.9 * 3600, now })
  assert.equal(Math.round(average.projectedHours ?? 0), 106)
  assert.equal(average.pace?.recent, false)
})

test('still warns when the last days would use up the hours, or when 90% is used', () => {
  const now = new Date('2026-11-21T13:42:00Z')
  const fast = usageReport({ ...november, computeSeconds: 75 * 3600, now, earlier: [yesterday] })
  assert.equal(fast.warn, true)
  assert.match(fast.reason, /run out before the month ends \(about 1\d\d hours\)/)
  const nearlyAll = usageReport({ ...november, computeSeconds: 91 * 3600, now: new Date('2026-11-29T12:00:00Z'), earlier: [{ ...yesterday, at: '2026-11-28T12:00:00Z', usedHours: 90.9 }] })
  assert.equal(nearlyAll.warn, true)
  assert.match(nearlyAll.reason, /91% of the monthly 100 database hours are used/)
})

test('only a reading from this period, 20 hours to 4 days old, sets the pace; the oldest of them wins', () => {
  const now = new Date('2026-11-21T12:00:00Z')
  const at = (hoursAgo: number, usedHours = 70, periodStart: string | null = '2026-11-01T00:00:00Z') => ({ at: new Date(now.getTime() - hoursAgo * 3600_000).toISOString(), usedHours, periodStart })
  assert.equal(recentReading([at(10), at(100)], '2026-11-01T00:00:00Z', now), null, 'too fresh, too old')
  assert.equal(recentReading([at(30, 70, '2026-10-01T00:00:00Z')], '2026-11-01T00:00:00Z', now), null, 'another period')
  assert.equal(recentReading([at(30, 71), at(90, 68), at(50, 69)], '2026-11-01T00:00:00Z', now)?.usedHours, 68)
  // A new period has no reading of its own yet: the period's average, judged after 5 days as before.
  const early = usageReport({ ...november, computeSeconds: 10 * 3600, now: new Date('2026-11-02T00:00:00Z'), earlier: [{ at: '2026-10-31T00:00:00Z', usedHours: 95, periodStart: '2026-10-01T00:00:00Z' }] })
  assert.equal(early.warn, false)
  assert.equal(early.pace?.recent, false)
})

test('keeps the last 14 readings for the next runs', () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, i + 1)).toISOString(), usedHours: i, periodStart: null }))
  const kept = keptReadings(list.slice(0, 19), list[19])
  assert.equal(kept.length, 14)
  assert.equal(kept[13].usedHours, 19)
  assert.equal(kept[0].usedHours, 6)
})

test('reads the earlier readings, reports the recent pace and keeps today\'s for tomorrow', async () => {
  const saved = { fetch: globalThis.fetch, log: console.log, env: { ...process.env }, exitCode: process.exitCode }
  const lines: string[] = []
  const file = join(mkdtempSync(join(tmpdir(), 'neon-usage-')), 'readings.json')
  const yesterdayAt = new Date(Date.now() - 24 * 3600_000).toISOString()
  const periodStart = new Date(Date.now() - 20 * 86_400_000).toISOString()
  const periodEnd = new Date(Date.now() + 10 * 86_400_000).toISOString()
  writeFileSync(file, JSON.stringify([{ at: yesterdayAt, usedHours: 71, periodStart }, { junk: true }]))
  try {
    process.env.NEON_API_KEY = 'key'
    process.env.NEON_DATABASE_URL = 'postgresql://u:p@ep-store-1.eu.aws.neon.tech/db'
    process.env.NEON_HISTORY_FILE = file
    delete process.env.NEON_WARN_AT_PERCENT
    delete process.env.GITHUB_STEP_SUMMARY
    // The report is printed in one call, a line each.
    console.log = (...a: unknown[]) => { lines.push(...a.join(' ').split('\n')) }
    globalThis.fetch = (async (url: string) => {
      const path = new URL(url).pathname.replace('/api/v2', '')
      const body = path === '/projects' ? { projects: [{ id: 'store' }] }
        : path === '/projects/store/endpoints' ? { endpoints: [{ id: 'ep-store-1' }] }
        : path === '/projects/store' ? { project: { id: 'store', compute_time_seconds: 73 * 3600, consumption_period_start: periodStart, consumption_period_end: periodEnd } }
        : null
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 })
    }) as typeof fetch
    process.exitCode = 0
    await main()
    assert.equal(process.exitCode, 0, lines.join('\n'))
    assert.ok(lines.some(l => l === 'Pace: 2.0 hours a day over the last 1.0 days'), lines.join('\n'))
    assert.ok(lines.some(l => /^At this pace: about 93 hours by the end of the period \(10 days left\)$/.test(l)), lines.join('\n'))
    const kept = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(kept.length, 2)
    assert.equal(kept[1].usedHours, 73)
    assert.equal(kept[1].periodStart, periodStart)
  } finally {
    globalThis.fetch = saved.fetch
    console.log = saved.log
    process.env = saved.env
    process.exitCode = saved.exitCode
  }
})

test('the workflow carries the readings from one run to the next and warns at 90%', () => {
  const workflow = readFileSync('.github/workflows/neon-usage.yml', 'utf8')
  assert.match(workflow, /uses: actions\/cache\/restore@v4\n\s+with:\n\s+path: neon-usage-history\.json\n\s+key: neon-usage-history-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\n\s+restore-keys: neon-usage-history-/)
  assert.match(workflow, /NEON_HISTORY_FILE: neon-usage-history\.json/)
  assert.match(workflow, /NEON_WARN_AT_PERCENT: "90"/)
  assert.match(workflow, /if: always\(\)\n\s+uses: actions\/cache\/save@v4\n\s+with:\n\s+path: neon-usage-history\.json\n\s+key: neon-usage-history-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/)
})
