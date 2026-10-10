import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAN_LIMITS, errorKindLabel, errorRateTooHigh, formatBytes, formatCount, formatPercent, lastDays, monitorTone, parseBackupLog, parseNeonUsageLog,
  readableAction, runLabel, runTone, timeAgo, toneForShare, worstTone,
} from '../lib/website-status-shared'
import { summarize, type StatusSections } from '../lib/website-status-summary'

const NEON_LOG = `2026-10-10T05:41:12.0000000Z ##[group]Run node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/neon-usage.ts
2026-10-10T05:41:13.1000000Z Database hours used this period: 3.1 of 100 (3%)
2026-10-10T05:41:13.1000000Z At this pace: about 42 hours by the end of the period (21 days left)
2026-10-10T05:41:13.1000000Z Active time: 12.4 hours
2026-10-10T05:41:13.1000000Z OK: within the monthly allowance.`

const BACKUP_LOG = `2026-10-10T00:20:01.0000000Z ##[group]Run name="yallahaul-$(date -u +%Y-%m-%d).dump"
2026-10-10T00:20:01.0000000Z echo "Saved $name ($(stat -c %s backup.dump) bytes) in $BUCKET; copies older than $KEEP_DAYS days are deleted automatically."
2026-10-10T00:19:40.0000000Z echo "Tables: $tables, rows per table:"; tr '\\n' ' ' < restored.txt; echo
2026-10-10T00:19:41.0000000Z Tables: 65, rows per table:
2026-10-10T00:19:41.0000000Z The copy restores with the same rows as the live database.
2026-10-10T00:20:05.0000000Z Saved yallahaul-2026-10-10.dump (197432 bytes) in ecommerce-pro-backups; copies older than 30 days are deleted automatically.`

test('the database hours check log is read, timestamps and all', () => {
  assert.deepEqual(parseNeonUsageLog(NEON_LOG), { usedHours: 3.1, limitHours: 100, projectedHours: 42, daysLeft: 21, warning: false })
  const warned = parseNeonUsageLog('x Database hours used this period: 75.0 of 100 (75%)\nx Pace: not known yet\nx WARNING: 75% of the monthly 100 database hours are used.')
  assert.deepEqual(warned, { usedHours: 75, limitHours: 100, projectedHours: null, daysLeft: null, warning: true })
  assert.equal(parseNeonUsageLog('no numbers here'), null)
})

test('the backup log gives the saved file, its size and the restore check, not the echoed script', () => {
  assert.deepEqual(parseBackupLog(BACKUP_LOG), { name: 'yallahaul-2026-10-10.dump', bytes: 197432, tables: 65, verified: true })
  assert.equal(parseBackupLog('echo "Saved $name ($(stat -c %s backup.dump) bytes)"'), null)
})

test('usage turns amber at 70% and red at 90% of a limit', () => {
  assert.equal(toneForShare(69, 100), 'ok')
  assert.equal(toneForShare(70, 100), 'warning')
  assert.equal(toneForShare(90, 100), 'critical')
  assert.equal(toneForShare(1, 0), 'off')
  assert.equal(worstTone(['ok', 'off', 'warning']), 'warning')
  assert.equal(worstTone(['off']), 'off')
})

test('numbers, sizes and times read naturally', () => {
  assert.equal(formatBytes(197432), '193 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5 MB')
  assert.equal(formatBytes(PLAN_LIMITS.databaseBytes), '1 GB')
  assert.equal(formatCount(1284), '1,284')
  assert.equal(formatCount(12_900), '12.9K')
  assert.equal(formatCount(10_000_000), '10M')
  assert.equal(formatPercent(3, 1000), '<1%')
  assert.equal(formatPercent(0, 1000), '0%')
  const now = new Date('2026-10-10T12:00:00Z')
  assert.equal(timeAgo('2026-10-10T11:59:30Z', now), 'just now')
  assert.equal(timeAgo('2026-10-10T11:15:00Z', now), '45 min ago')
  assert.equal(timeAgo('2026-10-10T03:00:00Z', now), '9 h ago')
  assert.equal(timeAgo('2026-10-07T12:00:00Z', now), '3 days ago')
  assert.deepEqual(lastDays(new Date('2026-10-02T01:00:00Z'), 3), ['2026-09-30', '2026-10-01', '2026-10-02'])
  assert.equal(readableAction('order.note_added'), 'Order note added')
  assert.equal(readableAction('theme.draft.updated'), 'Theme draft updated')
})

test('job runs and monitors map to a status', () => {
  assert.equal(runTone({ status: 'completed', conclusion: 'success' }), 'ok')
  assert.equal(runTone({ status: 'completed', conclusion: 'failure' }), 'critical')
  assert.equal(runTone({ status: 'in_progress', conclusion: null }), 'ok')
  assert.equal(runTone(null), 'off')
  assert.equal(runLabel({ status: 'queued', conclusion: null }), 'Running now')
  assert.equal(monitorTone('up'), 'ok')
  assert.equal(monitorTone('down'), 'critical')
  assert.equal(monitorTone('paused'), 'warning')
})

const NOW = new Date('2026-10-10T12:00:00Z')
const run = (conclusion: string, at = '2026-10-10T00:17:00Z') => ({ status: 'completed', conclusion, createdAt: at, url: 'https://github.com/x', title: 't' })

function healthy(): StatusSections {
  return {
    database: { state: 'ready', tone: 'ok', data: { sizeBytes: 40 * 1024 * 1024, version: '18.1', tables: [], counts: { products: 12, orders: 3, customers: 2, media: 20 }, orders24h: 1, orders7d: 3, customers7d: 2, changes24h: 4, lastOrderAt: null, activity: [] } },
    cloudflare: { state: 'ready', tone: 'ok', data: { traffic: { days: [{ date: '2026-10-10', requests: 5000, errors: 3 }], monthRequests: 40_000, monthErrors: 10, last24h: { requests: 5000, errors: 3 }, kinds: [] }, trafficIssue: null, media: { bytes: 80 * 1024 * 1024, files: 300, partial: false }, deployedAt: null } },
    email: { state: 'ready', tone: 'ok', data: { configured: true, from: 'Yalla Haul <orders@yallahaul.com>', sent24h: 2, sentMonth: 20, failed7d: 0, skipped7d: 0, recent: [] } },
    uptime: { state: 'ready', tone: 'ok', data: { monitors: [{ name: 'yallahaul.com', url: 'https://yallahaul.com', status: 'up', lastCheckedAt: null, availability: 99.9, incidents: 0, downtimeSeconds: 0 }] } },
    github: { state: 'ready', tone: 'ok', data: { repo: 'o/r', deploy: run('success'), backup: run('success'), usage: run('success'), backupResult: null, neonUsage: { usedHours: 3, limitHours: 100, projectedHours: 40, daysLeft: 20, warning: false } } },
  }
}

test('a healthy store has nothing to report', () => {
  assert.deepEqual(summarize(healthy(), NOW), { tone: 'ok', issues: [], notConnected: [] })
})

test('problems are listed in plain words, the urgent ones first', () => {
  const s = healthy()
  if (s.github.state === 'ready') {
    s.github.data.backup = run('failure')
    s.github.data.neonUsage = { usedHours: 30, limitHours: 100, projectedHours: 120, daysLeft: 12, warning: true }
  }
  if (s.uptime.state === 'ready') s.uptime.data.monitors[0].status = 'down'
  if (s.email.state === 'ready') s.email.data.failed7d = 2
  if (s.database.state === 'ready') s.database.data.sizeBytes = 0.8 * 1024 ** 3
  const summary = summarize(s, NOW)
  assert.equal(summary.tone, 'critical')
  assert.deepEqual(summary.issues.map(i => i.tone), ['critical', 'critical', 'warning', 'warning', 'warning'])
  const text = summary.issues.map(i => i.text).join('\n')
  assert.match(text, /yallahaul\.com is down right now/)
  assert.match(text, /last nightly backup failed/)
  assert.match(text, /about 120 of 100 by the end of the month/)
  assert.match(text, /2 emails could not be sent/)
  assert.match(text, /The database uses 819 MB of its free 1 GB \(80%\)/)
})

test('an old backup is flagged, and sections without a key are listed apart from problems', () => {
  const s = healthy()
  if (s.github.state === 'ready') s.github.data.backup = run('success', '2026-10-08T00:17:00Z')
  s.uptime = { state: 'not-connected', tone: 'off', missing: ['BETTERSTACK_API_TOKEN'] }
  const summary = summarize(s, NOW)
  assert.deepEqual(summary.issues, [{ tone: 'warning', text: 'No database backup in the last day and a half.' }])
  assert.deepEqual(summary.notConnected, ['Uptime (Better Stack)'])
})

test('a service that could not be reached is a warning, with its reason', () => {
  const s = healthy()
  s.github = { state: 'error', tone: 'warning', message: 'GitHub answered 500' }
  const summary = summarize(s, NOW)
  assert.equal(summary.tone, 'warning')
  assert.deepEqual(summary.issues.map(i => i.text), ['GitHub (deploys, backups, database hours): GitHub answered 500'])
})

// ---- The fetchers, against recorded shapes of each service's answers (no network).

const savedFetch = global.fetch
const savedEnv = { ...process.env }
function restore() {
  global.fetch = savedFetch
  for (const key of ['STATUS_GITHUB_TOKEN', 'STATUS_GITHUB_REPO', 'CLOUDFLARE_STATUS_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'BETTERSTACK_API_TOKEN']) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
}

test('GitHub: latest runs, then each job log through its signed download address without the key', async t => {
  t.after(restore)
  process.env.STATUS_GITHUB_TOKEN = 'gh-test'
  process.env.STATUS_GITHUB_REPO = 'owner/store'
  const seen: { url: string; auth: string | null; redirect?: string }[] = []
  global.fetch = (async (input: string, init: RequestInit = {}) => {
    const url = String(input)
    const auth = new Headers(init.headers).get('authorization')
    seen.push({ url, auth, redirect: init.redirect })
    const runs = (id: number, conclusion: string) => Response.json({ workflow_runs: [{ id, status: 'completed', conclusion, run_started_at: '2026-10-10T00:17:00Z', html_url: `https://github.com/owner/store/actions/runs/${id}`, display_title: 'run' }] })
    if (url.includes('/workflows/ci.yml/runs')) return runs(1, 'success')
    if (url.includes('/workflows/database-backup.yml/runs')) return runs(2, 'success')
    if (url.includes('/workflows/neon-usage.yml/runs')) return runs(3, 'success')
    if (url.endsWith('/actions/runs/2/jobs?per_page=5')) return Response.json({ jobs: [{ id: 20 }] })
    if (url.endsWith('/actions/runs/3/jobs?per_page=5')) return Response.json({ jobs: [{ id: 30 }] })
    if (url.endsWith('/actions/jobs/20/logs')) return new Response(null, { status: 302, headers: { location: 'https://logs.example/20' } })
    if (url.endsWith('/actions/jobs/30/logs')) return new Response(null, { status: 302, headers: { location: 'https://logs.example/30' } })
    if (url === 'https://logs.example/20') return new Response(BACKUP_LOG)
    if (url === 'https://logs.example/30') return new Response(NEON_LOG)
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  const { getGithubStatus } = await import('../lib/website-status')
  const result = await getGithubStatus()
  assert.equal(result.state, 'ready')
  if (result.state !== 'ready') return
  assert.equal(result.tone, 'ok')
  assert.equal(result.data.deploy?.url, 'https://github.com/owner/store/actions/runs/1')
  assert.deepEqual(result.data.backupResult, { name: 'yallahaul-2026-10-10.dump', bytes: 197432, tables: 65, verified: true })
  assert.equal(result.data.neonUsage?.usedHours, 3.1)
  assert.ok(seen.some(s => s.url.includes('ci.yml/runs?per_page=1&branch=main&event=push')))
  for (const s of seen) {
    if (s.url.startsWith('https://api.github.com')) assert.equal(s.auth, 'Bearer gh-test')
    else assert.equal(s.auth, null, 'the GitHub key must not go to the log download address')
  }
  assert.ok(seen.filter(s => s.url.endsWith('/logs')).every(s => s.redirect === 'manual'))
})

test('GitHub: an expired key says so; no key means not connected', async t => {
  t.after(restore)
  const { getGithubStatus } = await import('../lib/website-status')
  delete process.env.STATUS_GITHUB_TOKEN
  process.env.STATUS_GITHUB_REPO = 'owner/store'
  assert.deepEqual(await getGithubStatus(), { state: 'not-connected', tone: 'off', missing: ['STATUS_GITHUB_TOKEN'] })
  process.env.STATUS_GITHUB_TOKEN = 'old'
  global.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
  const result = await getGithubStatus()
  assert.equal(result.state, 'error')
  if (result.state === 'error') assert.match(result.message, /may have expired/)
})

test('Cloudflare: one total per day for 7 days plus the month, from one query', async t => {
  t.after(restore)
  process.env.CLOUDFLARE_STATUS_TOKEN = 'cf-test'
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc123'
  let body: any = null
  global.fetch = (async (input: string, init: RequestInit = {}) => {
    assert.equal(String(input), 'https://api.cloudflare.com/client/v4/graphql')
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer cf-test')
    body = JSON.parse(String(init.body))
    const account: Record<string, unknown> = {
      month: [{ sum: { requests: 9000, errors: 12 } }],
      last24h: [{ sum: { requests: 640, errors: 0 } }],
      kinds: [
        { dimensions: { status: 'success' }, sum: { errors: 0 } },
        { dimensions: { status: 'scriptThrewException' }, sum: { errors: 2 } },
        { dimensions: { status: 'exceededResources' }, sum: { errors: 9 } },
      ],
    }
    for (let i = 0; i < 7; i++) account[`d${i}`] = i === 3 ? [] : [{ sum: { requests: 100 * (i + 1), errors: i } }]
    return Response.json({ data: { viewer: { accounts: [account] } }, errors: null })
  }) as typeof fetch
  const { getCloudflareStatus } = await import('../lib/website-status')
  const result = await getCloudflareStatus()
  assert.equal(result.state, 'ready')
  if (result.state !== 'ready') return
  assert.equal(body.variables.account, 'acc123')
  assert.match(body.query, /d6: workersInvocationsAdaptive\(limit: 1, filter: \{ scriptName: "ecommerce-pro", datetime_geq: "/)
  assert.equal(result.data.traffic?.days.length, 7)
  assert.equal(result.data.traffic?.days[3].requests, 0)
  assert.equal(result.data.traffic?.days[6].requests, 700)
  assert.equal(result.data.traffic?.monthRequests, 9000)
  assert.deepEqual(result.data.traffic?.last24h, { requests: 640, errors: 0 })
  assert.deepEqual(result.data.traffic?.kinds, [{ status: 'exceededResources', errors: 9 }, { status: 'scriptThrewException', errors: 2 }])
  assert.match(body.query, /last24h: workersInvocationsAdaptive\(limit: 1,/)
  assert.match(body.query, /kinds: workersInvocationsAdaptive\(limit: 20, filter: \{ scriptName: "ecommerce-pro", datetime_geq: "[^"]+T00:00:00Z", datetime_leq: "[^"]+" \}\) \{ sum \{ errors \} dimensions \{ status \} \}/)
  assert.equal(result.data.trafficIssue, null)
  assert.equal(result.tone, 'ok')
})

test('Cloudflare: an error from the API is shown, not hidden', async t => {
  t.after(restore)
  process.env.CLOUDFLARE_STATUS_TOKEN = 'cf-test'
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc123'
  global.fetch = (async () => Response.json({ data: null, errors: [{ message: 'unknown field "x"' }] })) as typeof fetch
  const { getCloudflareStatus } = await import('../lib/website-status')
  const result = await getCloudflareStatus()
  assert.equal(result.state, 'ready')
  if (result.state === 'ready') {
    assert.equal(result.data.traffic, null)
    assert.deepEqual(result.data.trafficIssue, { message: 'Cloudflare said: unknown field "x"' })
    assert.equal(result.tone, 'warning')
  }
})

test('Better Stack: monitors with their 30-day uptime', async t => {
  t.after(restore)
  process.env.BETTERSTACK_API_TOKEN = 'bs-test'
  global.fetch = (async (input: string) => {
    const url = String(input)
    if (url === 'https://incidents.betterstack.com/api/v2/monitors') return Response.json({ data: [{ id: '7', attributes: { pronounceable_name: 'Yalla Haul home', url: 'https://yallahaul.com/robots.txt', status: 'up', last_checked_at: '2026-10-10T11:58:00Z' } }] })
    if (url.startsWith('https://incidents.betterstack.com/api/v2/monitors/7/sla?from=')) return Response.json({ data: { attributes: { availability: 99.95, total_downtime: 120, number_of_incidents: 1 } } })
    return new Response('no', { status: 404 })
  }) as typeof fetch
  const { getUptimeStatus } = await import('../lib/website-status')
  const result = await getUptimeStatus()
  assert.deepEqual(result, { state: 'ready', tone: 'ok', data: { monitors: [{ name: 'Yalla Haul home', url: 'https://yallahaul.com/robots.txt', status: 'up', lastCheckedAt: '2026-10-10T11:58:00Z', availability: 99.95, incidents: 1, downtimeSeconds: 120 }] } })
})

test('errors are judged on the last 24 hours and named in plain words', () => {
  assert.equal(errorRateTooHigh({ requests: 11_180, errors: 0 }), false)
  assert.equal(errorRateTooHigh({ requests: 15_867, errors: 1_272 }), true)
  assert.equal(errorRateTooHigh({ requests: 50, errors: 10 }), false, 'too few requests to judge')
  assert.equal(errorKindLabel('exceededResources'), 'Needed more processing than the plan allows')
  assert.equal(errorKindLabel('scriptThrewException'), 'Error in the website\u2019s code')
  assert.equal(errorKindLabel('somethingNew'), 'somethingNew')

  // Oct 4-10 as seen on the live page: a bad week that is over by today raises nothing.
  const s = healthy()
  if (s.cloudflare.state === 'ready' && s.cloudflare.data.traffic) {
    s.cloudflare.data.traffic.days = [{ date: '2026-10-09', requests: 15_867, errors: 1_272 }, { date: '2026-10-10', requests: 11_180, errors: 0 }]
    s.cloudflare.data.traffic.last24h = { requests: 11_180, errors: 0 }
  }
  assert.deepEqual(summarize(s, NOW).issues, [])
  if (s.cloudflare.state === 'ready' && s.cloudflare.data.traffic) s.cloudflare.data.traffic.last24h = { requests: 1000, errors: 60 }
  assert.deepEqual(summarize(s, NOW).issues, [{ tone: 'warning', text: '6% of website requests failed in the last 24 hours.' }])
})
