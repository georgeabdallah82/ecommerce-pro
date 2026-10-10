import test from 'node:test'
import assert from 'node:assert/strict'
import { endpointIdFromUrl, main, usageReport } from '../scripts/neon-usage'

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
        : path === '/projects/store' ? { project: { id: 'store', compute_time_seconds: 75 * 3600, active_time_seconds: 300 * 3600, consumption_period_start: '2026-10-01T00:00:00Z', consumption_period_end: '2026-11-01T00:00:00Z' } }
        : null
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 })
    }) as typeof fetch
    process.exitCode = 0
    await main()
    assert.equal(process.exitCode, 1)
    assert.ok(asked.includes('/projects/store'))
    assert.ok(lines.some(l => l.includes('75.0 of 100 (75%)')), lines.join('\n'))
    assert.ok(lines.some(l => l.startsWith('::error::75% of the monthly 100 database hours')))
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
