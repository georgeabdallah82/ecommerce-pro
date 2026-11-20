import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { EDGE_COPY_MAX_AGE_MS, parseEdgeConfig, redirectFor } from '@/lib/edge-config'
import { parseMaintenancePageData } from '@/lib/maintenance-page-data'
import { hourlyJobsDue, parseHourlyJobs } from '@/lib/hourly-jobs'
import { GET as maintenancePage } from '@/app/maintenance/route'
import { POST as hourlyIdle } from '@/app/api/internal/hourly-idle/route'

// Database wake-ups (docs/database-wakeups-2026-11.md): requests and the hourly jobs no longer wake the database when they
// don't need it.
const read = (path: string) => readFileSync(path, 'utf8')
const NOW = Date.UTC(2026, 10, 20, 9, 0)
const copy = (over: Record<string, unknown> = {}) => ({ v: 1, at: NOW - 60_000, maintenance: true, redirects: { '/old': ['r1', '/new'] }, partial: false, ...over })

describe("the proxy's copy", () => {
  it('is used while it is readable and under 6 hours old', () => {
    assert.deepEqual(parseEdgeConfig(JSON.stringify(copy()), NOW), copy())
    assert.equal(parseEdgeConfig(copy({ at: NOW - EDGE_COPY_MAX_AGE_MS - 1 }), NOW), null)
    assert.equal(parseEdgeConfig(copy({ at: NOW + 5 * 60_000 }), NOW), null)
    for (const bad of ['', 'not json', JSON.stringify(copy({ v: 2 })), JSON.stringify(copy({ maintenance: 'yes' })), JSON.stringify(copy({ redirects: [] }))]) assert.equal(parseEdgeConfig(bad, NOW), null, bad)
  })
  it('answers redirects: found, none, or "ask the database" when it was cut short', () => {
    const config = parseEdgeConfig(copy(), NOW)!
    assert.deepEqual(redirectFor(config, '/old'), { id: 'r1', toPath: '/new' })
    assert.equal(redirectFor(config, '/other'), null)
    assert.equal(redirectFor(config, 'constructor'), null)
    assert.equal(redirectFor(parseEdgeConfig(copy({ partial: true }), NOW)!, '/other'), undefined)
  })
  it('the proxy reads it first and asks the database only without it', () => {
    const proxy = read('proxy.ts')
    assert.match(proxy, /const edge = needsRedirectCheck \|\| needsMaintenanceCheck \? await readEdgeConfig\(\)\.catch\(\(\) => null\) : null/)
    assert.match(proxy, /edgeRedirect === undefined \? await findRedirect\(pathname\)/)
    assert.match(proxy, /: await Promise\.all\(\[\n\s+needsRedirectCheck \? findRedirect\(pathname\)/)
  })
  it('is cleared by every save that changes it, and again a few seconds later', () => {
    const settings = read('app/api/admin/settings/route.ts')
    assert.match(settings, /if\(saved\.length\)await clearEdgeCopies\('all',runInBackground\)/)
    assert.match(settings, /await clearEdgeCopies\('all',runInBackground\);return json\(\{setting:masked\(s\)\}\)/)
    assert.equal((read('app/api/admin/redirects/route.ts').match(/await clearEdgeCopies\('config', runInBackground\)/g) || []).length, 3)
    assert.equal((read('lib/redirect-moves.ts').match(/await clearEdgeCopies\('config', runInBackground\)/g) || []).length, 2)
    for (const path of ['app/api/admin/theme/publish/route.ts', 'app/api/admin/theme/versions/[id]/restore/route.ts']) assert.match(read(path), /await clearEdgeCopies\('page', runInBackground\)/, path)
    assert.match(read('lib/edge-config.ts'), /later\?\.\(new Promise\(resolve => setTimeout\(resolve, 5000\)\)\.then\(clear\)\)/)
  })
})

describe('the maintenance page', () => {
  it('keeps its own copy, used while under 6 hours old', () => {
    const data = { v: 1, at: NOW - 60_000, maintenance: { enabled: true }, brand: 'Shop', logoUrl: null, color: null, phone: '70123456', country: 'Lebanon', email: null }
    assert.deepEqual(parseMaintenancePageData(JSON.stringify(data), NOW), data)
    assert.equal(parseMaintenancePageData({ ...data, at: NOW - EDGE_COPY_MAX_AGE_MS - 1 }, NOW), null)
  })
  it('a visitor the proxy sent there sees the closed page, never a way back home (no loop just after reopening)', async () => {
    // The test store is open: alone, /maintenance sends visitors home; sent by the proxy, it shows the closed page.
    const direct = await maintenancePage(new Request('http://x/maintenance'))
    assert.equal(direct.status, 307)
    const viaGate = await maintenancePage(new Request('http://x/maintenance', { headers: { 'x-maintenance-gate': '1' } }))
    assert.equal(viaGate.status, 503)
    assert.equal(viaGate.headers.get('retry-after'), '3600')
    assert.match(read('proxy.ts'), /gateHeaders\.set\(MAINTENANCE_GATE_HEADER, '1'\)/)
  })
  it('without a bucket it reads the database as before, and says where its details came from', async () => {
    const res = await maintenancePage(new Request('http://x/maintenance?preview=1'))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-page-data'), 'database')
    assert.match(await res.text(), /<html/i)
  })
})

describe('the hourly jobs', () => {
  it('run while there is work, every 6 hours regardless, and when there is no marker yet', () => {
    const at = (hour: number) => Date.UTC(2026, 10, 20, hour, 0)
    assert.equal(hourlyJobsDue(at(9), null), true)
    assert.equal(hourlyJobsDue(at(9), { armed: true, at: 0 }), true)
    assert.deepEqual([0, 1, 5, 6, 9, 12, 13, 18, 23].map(h => hourlyJobsDue(at(h), { armed: false, at: 0 })), [true, false, false, true, false, true, false, true, false])
    assert.deepEqual(parseHourlyJobs('{"armed":false,"at":5}'), { armed: false, at: 5 })
    assert.equal(parseHourlyJobs('{"armed":"no"}'), null)
  })
  it('the Worker reads the marker before waking the database, and runs the idle check last', () => {
    const worker = read('worker.ts')
    assert.match(worker, /const object = await env\?\.MEDIA_BUCKET\?\.get\(HOURLY_JOBS_KEY\)/)
    assert.match(worker, /if \(hourly\) paths\.push\('\/api\/internal\/retry-outbox'\)\n\s+if \(hourly\) paths\.push\('\/api\/internal\/hourly-idle'\)/)
  })
  it('the idle check answers only the Worker or the bearer, and reports what is still waiting', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    assert.equal((await hourlyIdle(new Request('http://x/api/internal/hourly-idle', { method: 'POST' }))).status, 401)
    const res = await hourlyIdle(new Request('http://x/api/internal/hourly-idle', { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } }))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body.waiting), ['retries', 'cardCheckouts', 'gatewayRefunds'])
    assert.equal(typeof body.idle, 'boolean')
  })
})
