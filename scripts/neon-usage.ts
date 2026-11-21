// Daily check of the store database's compute hours against Neon's monthly allowance, so the owner
// hears about it well before the free plan's hours run out (Neon then stops the database until the
// next period, and the store with it). Run by .github/workflows/neon-usage.yml; exits 1 (the owner is
// then alerted, .github/workflows/check-alerts.yml) when the warning applies. Read-only on Neon: it
// only reads usage from the Neon API.
//
// The pace comes from the last few days when earlier readings are kept (NEON_HISTORY_FILE, carried
// between runs in GitHub's cache), so a fix that cuts the hours shows within days instead of being
// averaged away by the whole month (docs/hours-check-pace-2026-11.md).
//
//   NEON_API_KEY=... NEON_DATABASE_URL=postgresql://... [NEON_HISTORY_FILE=readings.json] node scripts/neon-usage.ts
//
// Plain TypeScript that Node runs directly (type stripping), so the workflow needs no install.

import { pathToFileURL } from 'node:url'

// The Neon compute ("endpoint") id from the store's connection string: the first label of the
// host, without the "-pooler" suffix of the pooled address.
export function endpointIdFromUrl(databaseUrl: string): string {
  const host = new URL(databaseUrl).hostname
  return host.split('.')[0].replace(/-pooler$/, '')
}

// An earlier day's reading (kept by the workflow between runs).
export type Reading = { at: string; usedHours: number; periodStart: string | null }

export type UsageInput = {
  computeSeconds: number // CU-seconds used so far this period (Neon's compute_time_seconds)
  periodStart?: string | null
  periodEnd?: string | null
  now: Date
  limitHours: number // the plan's CU-hours per period
  warnAtPercent: number
  earlier?: Reading[]
}

export type UsageReport = {
  usedHours: number
  percent: number
  projectedHours: number | null
  daysLeft: number | null
  // Hours a day, and over what: the last days (earlier readings) or the period so far.
  pace: { perDay: number; overDays: number; recent: boolean } | null
  warn: boolean
  reason: string
}

const DAY = 86_400_000
// The pace is read over the last days: from the oldest reading of this period between 20 hours and
// 4 days ago. Closer than that, one busy evening counts too much; further back, a change made this
// week (a fix that cuts the hours) is averaged away.
const RECENT_MIN_MS = 20 * 3600_000
const RECENT_MAX_MS = 4 * DAY

export function recentReading(earlier: Reading[] | undefined, periodStart: string | null | undefined, now: Date): Reading | null {
  const candidates = (earlier || []).filter(r => {
    const age = now.getTime() - Date.parse(r.at)
    return r.periodStart === (periodStart ?? null) && Number.isFinite(r.usedHours) && age >= RECENT_MIN_MS && age <= RECENT_MAX_MS
  })
  return candidates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] || null
}

// Used hours, share of the allowance, and where the period is heading at the current pace. Warns
// when the share used passes warnAtPercent, or when the pace would use up the allowance before the
// period ends. The pace is the last days' when earlier readings are kept; otherwise the period's
// average, judged only after the first 5 days, when a few busy days don't skew it.
export function usageReport(input: UsageInput): UsageReport {
  const usedHours = input.computeSeconds / 3600
  const percent = (usedHours / input.limitHours) * 100
  const start = input.periodStart ? Date.parse(input.periodStart) : NaN
  const end = input.periodEnd ? Date.parse(input.periodEnd) : NaN
  let projectedHours: number | null = null
  let daysLeft: number | null = null
  let pace: UsageReport['pace'] = null
  let judgePace = false
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const now = input.now.getTime()
    const elapsedDays = Math.max(0, (now - start) / DAY)
    daysLeft = Math.max(0, (end - now) / DAY)
    const before = recentReading(input.earlier, input.periodStart, input.now)
    if (before && usedHours >= before.usedHours) {
      const overDays = (now - Date.parse(before.at)) / DAY
      pace = { perDay: (usedHours - before.usedHours) / overDays, overDays, recent: true }
      judgePace = true
    } else if (elapsedDays > 0) {
      pace = { perDay: usedHours / elapsedDays, overDays: elapsedDays, recent: false }
      judgePace = elapsedDays >= 5
    }
    if (pace) projectedHours = usedHours + pace.perDay * daysLeft
  }
  const report = { usedHours, percent, projectedHours, daysLeft, pace }
  if (percent >= input.warnAtPercent) {
    return { ...report, warn: true, reason: `${Math.round(percent)}% of the monthly ${input.limitHours} database hours are used` }
  }
  if (projectedHours !== null && judgePace && projectedHours >= input.limitHours) {
    return { ...report, warn: true, reason: `at this pace the ${input.limitHours} monthly database hours run out before the month ends (about ${Math.round(projectedHours)} hours)` }
  }
  return { ...report, warn: false, reason: 'within the monthly allowance' }
}

// The readings kept for the next runs: this one added, the last 14 kept.
export function keptReadings(earlier: Reading[], latest: Reading): Reading[] {
  return [...earlier, latest].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-14)
}

async function readEarlier(file: string): Promise<Reading[]> {
  const { readFile } = await import('node:fs/promises')
  try {
    const list = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(list) ? list.filter((r: any) => r && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at)) && typeof r.usedHours === 'number').map((r: any) => ({ at: r.at, usedHours: r.usedHours, periodStart: typeof r.periodStart === 'string' ? r.periodStart : null })) : []
  } catch {
    return []
  }
}

class NeonError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function neon(path: string, apiKey: string): Promise<any> {
  const response = await fetch(`https://console.neon.tech/api/v2${path}`, { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } })
  if (!response.ok) {
    // Neon's own explanation (never contains the key), e.g. "org_id is required".
    const detail = await response.json().then((b: any) => String(b?.message || ''), () => '')
    const hint = response.status === 401 ? ' (check the NEON_API_KEY secret)' : ''
    throw new NeonError(`Neon API ${path.split('?')[0]} answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}${hint}`, response.status)
  }
  return response.json()
}

// Every project the key can see. A personal key on an account whose projects belong to a Neon
// organization must name the organization when listing projects (Neon answers 400 otherwise), so
// on a 400 the projects of each of the key's organizations are listed instead.
async function listProjects(apiKey: string): Promise<any[]> {
  try {
    return (await neon('/projects?limit=100', apiKey)).projects || []
  } catch (error) {
    if (!(error instanceof NeonError) || error.status !== 400) throw error
    const { organizations = [] } = await neon('/users/me/organizations', apiKey)
    const projects: any[] = []
    for (const org of organizations) projects.push(...((await neon(`/projects?limit=100&org_id=${encodeURIComponent(org.id)}`, apiKey)).projects || []))
    return projects
  }
}

export async function main() {
  const apiKey = process.env.NEON_API_KEY || ''
  const databaseUrl = process.env.NEON_DATABASE_URL || ''
  const limitHours = Number(process.env.NEON_LIMIT_HOURS || 100)
  const warnAtPercent = Number(process.env.NEON_WARN_AT_PERCENT || 90)
  const historyFile = process.env.NEON_HISTORY_FILE || ''
  if (!apiKey) throw new Error('NEON_API_KEY is not set: create an API key in the Neon Console (Account settings > API keys) and save it as a GitHub Actions secret')
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error('NEON_DATABASE_URL is not set')

  // The project whose compute the store connects to.
  const endpointId = endpointIdFromUrl(databaseUrl)
  const projects = await listProjects(apiKey)
  let project: any = null
  for (const candidate of projects) {
    const { endpoints = [] } = await neon(`/projects/${candidate.id}/endpoints`, apiKey)
    if (endpoints.some((e: any) => e.id === endpointId)) { project = candidate; break }
  }
  if (!project) throw new Error(`No Neon project with the store's compute (${endpointId}) is visible to this API key`)
  const details = (await neon(`/projects/${project.id}`, apiKey)).project || project

  const now = new Date()
  const earlier = historyFile ? await readEarlier(historyFile) : []
  const report = usageReport({
    computeSeconds: Number(details.compute_time_seconds || 0),
    periodStart: details.consumption_period_start,
    periodEnd: details.consumption_period_end,
    now,
    limitHours,
    warnAtPercent,
    earlier,
  })
  if (historyFile) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(historyFile, JSON.stringify(keptReadings(earlier, { at: now.toISOString(), usedHours: Math.round(report.usedHours * 1000) / 1000, periodStart: details.consumption_period_start || null })))
  }
  const lines = [
    `Database hours used this period: ${report.usedHours.toFixed(1)} of ${limitHours} (${report.percent.toFixed(0)}%)`,
    report.projectedHours !== null ? `At this pace: about ${report.projectedHours.toFixed(0)} hours by the end of the period${report.daysLeft !== null ? ` (${report.daysLeft.toFixed(0)} days left)` : ''}` : 'Pace: not known yet (no billing period reported)',
    ...(report.pace ? [report.pace.recent ? `Pace: ${report.pace.perDay.toFixed(1)} hours a day over the last ${report.pace.overDays.toFixed(1)} days` : `Pace: ${report.pace.perDay.toFixed(1)} hours a day, the period's average (no reading from the last days yet)`] : []),
    `Active time: ${(Number(details.active_time_seconds || 0) / 3600).toFixed(1)} hours`,
    report.warn ? `WARNING: ${report.reason}. Options: upgrade Neon to the Launch plan (pay per use, about $0.11 per hour above the allowance), or reduce what keeps the database awake.` : `OK: ${report.reason}.`,
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Neon database hours\n\n${lines.map(l => `- ${l}`).join('\n')}\n`)
  }
  if (report.warn) {
    console.log(`::error::${report.reason}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.log(`::error::${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
}
