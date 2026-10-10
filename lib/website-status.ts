import { cache } from 'react'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { db } from '@/lib/prisma'
import {
  PLAN_LIMITS, lastDays, monitorTone, parseBackupLog, parseNeonUsageLog, runTone, toneForShare, worstTone,
  type BackupResult, type NeonUsage, type Tone,
} from '@/lib/website-status-shared'

// Admin > Website status: the store's database, hosting, emails, uptime and code in one place.
// Each section is gathered on its own, so one service being down or not connected never hides
// the others. Read-only everywhere: nothing here changes any service.
//
// Keys (Worker secrets, uploaded by the CI deploy from the GitHub secrets of the same name):
//   STATUS_GITHUB_TOKEN      GitHub fine-grained token, this repository only, "Actions: Read"
//   CLOUDFLARE_STATUS_TOKEN  Cloudflare API token, "Account Analytics: Read" only
//   BETTERSTACK_API_TOKEN    Better Stack Uptime API token
// The database, the media bucket and the email log need no key. The Neon API key deliberately
// stays in GitHub (it could delete the database project): the database hours come from the
// daily check's log instead, and the backup's size from the nightly backup's log.

export type Section<T> =
  | { state: 'ready'; tone: Tone; data: T }
  | { state: 'not-connected'; tone: 'off'; missing: string[] }
  | { state: 'error'; tone: Tone; message: string }

const TIMEOUT_MS = 8000
const WORKER_NAME = 'ecommerce-pro'

function failed(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/timed? ?out|aborted/i.test(message)) return 'It did not answer in time. Refresh to try again.'
  return message.slice(0, 200)
}

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))])
}

async function bindings(): Promise<Record<string, any>> {
  try { return (await getCloudflareContext({ async: true })).env as Record<string, any> } catch { return {} }
}

// ---------------------------------------------------------------- GitHub (runs, backup, hours)

export type Run = { status: string; conclusion: string | null; createdAt: string; url: string; title: string }
export type GithubStatus = { repo: string; deploy: Run | null; backup: Run | null; usage: Run | null; backupResult: BackupResult | null; neonUsage: NeonUsage | null }

async function github(path: string, token: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'website-status' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

async function githubJson(path: string, token: string): Promise<any> {
  const response = await github(path, token)
  if (response.status === 401) throw new Error('GitHub refused the key (STATUS_GITHUB_TOKEN): it may have expired. Create a new one.')
  if (response.status === 403 || response.status === 404) throw new Error(`GitHub answered ${response.status}: the key (STATUS_GITHUB_TOKEN) needs access to this repository with "Actions: Read".`)
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  return response.json()
}

async function latestRun(repo: string, token: string, workflow: string, query: string): Promise<(Run & { id: number }) | null> {
  const body = await githubJson(`/repos/${repo}/actions/workflows/${workflow}/runs?per_page=1&${query}`, token)
  const run = body?.workflow_runs?.[0]
  if (!run) return null
  return { id: run.id, status: run.status, conclusion: run.conclusion, createdAt: run.run_started_at || run.created_at, url: run.html_url, title: run.display_title || run.name }
}

// The log of a run's first job. GitHub answers with a redirect to a signed download address,
// which must be fetched without the GitHub key.
async function firstJobLog(repo: string, token: string, runId: number): Promise<string> {
  const jobs = await githubJson(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=5`, token)
  const job = jobs?.jobs?.[0]
  if (!job) return ''
  const redirect = await github(`/repos/${repo}/actions/jobs/${job.id}/logs`, token, { redirect: 'manual' })
  const location = redirect.headers.get('location')
  if (location) {
    const log = await fetch(location, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return log.ok ? log.text() : ''
  }
  return redirect.ok ? redirect.text() : ''
}

function publicRun(run: (Run & { id: number }) | null): Run | null {
  if (!run) return null
  const { id: _id, ...rest } = run
  return rest
}

export const getGithubStatus = cache(async (): Promise<Section<GithubStatus>> => {
  const token = process.env.STATUS_GITHUB_TOKEN || ''
  const repo = process.env.STATUS_GITHUB_REPO || ''
  const missing = [!token && 'STATUS_GITHUB_TOKEN', !repo && 'STATUS_GITHUB_REPO'].filter(Boolean) as string[]
  if (missing.length) return { state: 'not-connected', tone: 'off', missing }
  try {
    const [deploy, backup, usage] = await Promise.all([
      latestRun(repo, token, 'ci.yml', 'branch=main&event=push'),
      latestRun(repo, token, 'database-backup.yml', 'status=completed'),
      latestRun(repo, token, 'neon-usage.yml', 'status=completed'),
    ])
    const [backupLog, usageLog] = await Promise.all([
      backup ? firstJobLog(repo, token, backup.id).catch(() => '') : '',
      usage ? firstJobLog(repo, token, usage.id).catch(() => '') : '',
    ])
    const backupResult = backupLog ? parseBackupLog(backupLog) : null
    const neonUsage = usageLog ? parseNeonUsageLog(usageLog) : null
    // The hours check fails on purpose when it warns; that's a warning, not a broken check.
    const usageTone: Tone = usage && usage.conclusion === 'failure' && neonUsage?.warning ? 'warning' : runTone(usage)
    const tone = worstTone([runTone(deploy), runTone(backup), usageTone].map(t => (t === 'off' ? 'ok' : t)))
    return { state: 'ready', tone, data: { repo, deploy: publicRun(deploy), backup: publicRun(backup), usage: publicRun(usage), backupResult, neonUsage } }
  } catch (error) {
    return { state: 'error', tone: 'warning', message: failed(error) }
  }
})

// ---------------------------------------------------------------- Database

export type DatabaseStatus = {
  sizeBytes: number
  version: string
  tables: { name: string; bytes: number }[]
  counts: { products: number; orders: number; customers: number; media: number }
  orders24h: number
  orders7d: number
  customers7d: number
  changes24h: number
  lastOrderAt: string | null
  activity: { action: string; entity: string; actor: string | null; at: string }[]
}

export const getDatabaseStatus = cache(async (): Promise<Section<DatabaseStatus>> => {
  const now = Date.now()
  const dayAgo = new Date(now - 86_400_000)
  const weekAgo = new Date(now - 7 * 86_400_000)
  try {
    const [info, tables, products, orders, customers, media, orders24h, orders7d, customers7d, changes24h, lastOrder, activity] = await withTimeout(Promise.all([
      db.$queryRaw<{ bytes: bigint; version: string }[]>`SELECT pg_database_size(current_database()) AS bytes, current_setting('server_version') AS version`,
      db.$queryRaw<{ name: string; bytes: bigint }[]>`SELECT c.relname::text AS name, pg_total_relation_size(c.oid) AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND left(c.relname, 1) <> '_' ORDER BY bytes DESC LIMIT 6`,
      db.product.count(),
      db.order.count(),
      db.user.count({ where: { role: 'CUSTOMER' } }),
      db.mediaAsset.count(),
      db.order.count({ where: { createdAt: { gte: dayAgo } } }),
      db.order.count({ where: { createdAt: { gte: weekAgo } } }),
      db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: weekAgo } } }),
      db.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
      db.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { action: true, entity: true, createdAt: true, actor: { select: { name: true, email: true } } } }),
    ]), 12_000)
    const sizeBytes = Number(info[0]?.bytes || 0)
    return {
      state: 'ready',
      tone: toneForShare(sizeBytes, PLAN_LIMITS.databaseBytes),
      data: {
        sizeBytes,
        version: String(info[0]?.version || '').split(' ')[0],
        tables: tables.map(t => ({ name: t.name, bytes: Number(t.bytes) })),
        counts: { products, orders, customers, media },
        orders24h, orders7d, customers7d, changes24h,
        lastOrderAt: lastOrder?.createdAt.toISOString() || null,
        activity: activity.map(a => ({ action: a.action, entity: a.entity, actor: a.actor?.name || a.actor?.email || null, at: a.createdAt.toISOString() })),
      },
    }
  } catch (error) {
    return { state: 'error', tone: 'critical', message: `The database did not answer: ${failed(error)}` }
  }
})

// ---------------------------------------------------------------- Cloudflare (traffic, files, deploy)

export type CloudflareStatus = {
  traffic: { days: { date: string; requests: number; errors: number }[]; monthRequests: number; monthErrors: number } | null
  trafficIssue: { missing: string[] } | { message: string } | null
  media: { bytes: number; files: number; partial: boolean } | null
  deployedAt: string | null
}

async function workerTraffic(token: string, accountId: string, now: Date): Promise<NonNullable<CloudflareStatus['traffic']>> {
  // One total per day (UTC) for the last 7 days, plus the month so far: each is the requests
  // summed over a time window, which needs no grouping by date.
  const days = lastDays(now, 7)
  const windows = days.map((date, i) => ({ alias: `d${i}`, start: `${date}T00:00:00Z`, end: i === days.length - 1 ? now.toISOString() : `${date}T23:59:59Z` }))
  const monthStart = `${now.toISOString().slice(0, 7)}-01T00:00:00Z`
  windows.push({ alias: 'month', start: monthStart, end: now.toISOString() })
  const fields = windows.map(w => `${w.alias}: workersInvocationsAdaptive(limit: 1, filter: { scriptName: "${WORKER_NAME}", datetime_geq: "${w.start}", datetime_leq: "${w.end}" }) { sum { requests errors } }`).join('\n')
  const query = `query ($account: string!) { viewer { accounts(filter: { accountTag: $account }) { ${fields} } } }`
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: accountId } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 401 || response.status === 403) throw new Error('Cloudflare refused the key (CLOUDFLARE_STATUS_TOKEN): it needs "Account Analytics: Read".')
  const body: any = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(`Cloudflare answered ${response.status}`)
  if (body.errors?.length) throw new Error(`Cloudflare said: ${String(body.errors[0]?.message || 'error').slice(0, 160)}`)
  const account = body.data?.viewer?.accounts?.[0]
  if (!account) throw new Error('Cloudflare has no account with this CLOUDFLARE_ACCOUNT_ID for this key.')
  const total = (alias: string) => {
    const rows: any[] = account[alias] || []
    return rows.reduce((acc, row) => ({ requests: acc.requests + Number(row?.sum?.requests || 0), errors: acc.errors + Number(row?.sum?.errors || 0) }), { requests: 0, errors: 0 })
  }
  const month = total('month')
  return { days: days.map((date, i) => ({ date, ...total(`d${i}`) })), monthRequests: month.requests, monthErrors: month.errors }
}

// Total size of the uploaded images (R2 bucket bound as MEDIA_BUCKET). Stops after 20,000 files
// and says so, rather than keep the page waiting.
async function mediaUsage(bucket: any): Promise<CloudflareStatus['media']> {
  if (!bucket?.list) return null
  let bytes = 0
  let files = 0
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const listed: any = await bucket.list({ limit: 1000, cursor })
    for (const object of listed.objects || []) { bytes += Number(object.size || 0); files++ }
    if (!listed.truncated) return { bytes, files, partial: false }
    cursor = listed.cursor
  }
  return { bytes, files, partial: true }
}

export const getCloudflareStatus = cache(async (): Promise<Section<CloudflareStatus>> => {
  const token = process.env.CLOUDFLARE_STATUS_TOKEN || ''
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || ''
  const env = await bindings()
  const missing = [!token && 'CLOUDFLARE_STATUS_TOKEN', !accountId && 'CLOUDFLARE_ACCOUNT_ID'].filter(Boolean) as string[]
  const [traffic, media] = await Promise.all([
    missing.length ? Promise.resolve(null) : workerTraffic(token, accountId, new Date()).catch((error: unknown) => ({ message: failed(error) })),
    withTimeout(mediaUsage(env.MEDIA_BUCKET)).catch(() => null),
  ])
  const trafficData = traffic && 'days' in traffic ? traffic : null
  const trafficIssue = missing.length ? { missing } : traffic && 'message' in traffic ? { message: traffic.message } : null
  const deployedAt = env.CF_VERSION_METADATA?.timestamp ? String(env.CF_VERSION_METADATA.timestamp) : null
  const tones: Tone[] = []
  if (trafficData) {
    tones.push(toneForShare(trafficData.monthRequests, PLAN_LIMITS.workerRequests))
    const weekRequests = trafficData.days.reduce((s, d) => s + d.requests, 0)
    const weekErrors = trafficData.days.reduce((s, d) => s + d.errors, 0)
    // A few errors are normal (visitors closing the page mid-load); 2% of requests is not.
    if (weekRequests >= 100 && weekErrors / weekRequests >= 0.02) tones.push('warning')
  } else if (trafficIssue && 'message' in trafficIssue) tones.push('warning')
  if (media) tones.push(toneForShare(media.bytes, PLAN_LIMITS.mediaBytes))
  return { state: 'ready', tone: worstTone(tones), data: { traffic: trafficData, trafficIssue, media, deployedAt } }
})

// ---------------------------------------------------------------- Emails (Resend)

export type EmailStatus = {
  configured: boolean
  from: string | null
  sent24h: number
  sentMonth: number
  failed7d: number
  skipped7d: number
  recent: { to: string; subject: string; status: string; error: string | null; at: string }[]
}

export const getEmailStatus = cache(async (): Promise<Section<EmailStatus>> => {
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 86_400_000)
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
  try {
    const [sent24h, sentMonth, failed7d, skipped7d, recent] = await withTimeout(Promise.all([
      db.emailLog.count({ where: { status: 'sent', createdAt: { gte: dayAgo } } }),
      db.emailLog.count({ where: { status: 'sent', createdAt: { gte: monthStart } } }),
      db.emailLog.count({ where: { status: 'failed', createdAt: { gte: weekAgo } } }),
      db.emailLog.count({ where: { status: 'skipped', createdAt: { gte: weekAgo } } }),
      db.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { to: true, subject: true, status: true, error: true, createdAt: true } }),
    ]))
    const tone = worstTone([
      configured ? 'ok' : 'critical',
      failed7d > 0 ? 'warning' : 'ok',
      toneForShare(sent24h, PLAN_LIMITS.emailsPerDay),
      toneForShare(sentMonth, PLAN_LIMITS.emailsPerMonth),
    ])
    return {
      state: 'ready',
      tone,
      data: { configured, from: process.env.EMAIL_FROM || null, sent24h, sentMonth, failed7d, skipped7d, recent: recent.map(r => ({ to: r.to, subject: r.subject, status: r.status, error: r.error, at: r.createdAt.toISOString() })) },
    }
  } catch (error) {
    return { state: 'error', tone: configured ? 'warning' : 'critical', message: `Could not read the email log: ${failed(error)}` }
  }
})

// ---------------------------------------------------------------- Uptime (Better Stack)

export type UptimeStatus = {
  monitors: { name: string; url: string; status: string; lastCheckedAt: string | null; availability: number | null; incidents: number | null; downtimeSeconds: number | null }[]
}

async function betterStack(path: string, token: string): Promise<any> {
  const response = await fetch(`https://incidents.betterstack.com/api/v2${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (response.status === 401 || response.status === 403) throw new Error('Better Stack refused the key (BETTERSTACK_API_TOKEN). Use an "Uptime API token" from Better Stack > API tokens.')
  if (!response.ok) throw new Error(`Better Stack answered ${response.status}`)
  return response.json()
}

export const getUptimeStatus = cache(async (): Promise<Section<UptimeStatus>> => {
  const token = process.env.BETTERSTACK_API_TOKEN || ''
  if (!token) return { state: 'not-connected', tone: 'off', missing: ['BETTERSTACK_API_TOKEN'] }
  try {
    const list = await betterStack('/monitors', token)
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 86_400_000)
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const monitors = await Promise.all((list?.data || []).slice(0, 6).map(async (m: any) => {
      const sla = await betterStack(`/monitors/${encodeURIComponent(m.id)}/sla?from=${day(from)}&to=${day(to)}`, token).catch(() => null)
      const a = sla?.data?.attributes
      return {
        name: String(m.attributes?.pronounceable_name || m.attributes?.url || 'Monitor'),
        url: String(m.attributes?.url || ''),
        status: String(m.attributes?.status || 'unknown'),
        lastCheckedAt: m.attributes?.last_checked_at || null,
        availability: typeof a?.availability === 'number' ? a.availability : null,
        incidents: typeof a?.number_of_incidents === 'number' ? a.number_of_incidents : null,
        downtimeSeconds: typeof a?.total_downtime === 'number' ? a.total_downtime : null,
      }
    }))
    return { state: 'ready', tone: monitors.length ? worstTone(monitors.map(m => monitorTone(m.status))) : 'warning', data: { monitors } }
  } catch (error) {
    return { state: 'error', tone: 'warning', message: failed(error) }
  }
})
