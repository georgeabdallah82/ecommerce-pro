// Daily check of the store database's compute hours against Neon's monthly allowance, so the owner
// hears about it well before the free plan's hours run out (Neon then stops the database until the
// next period, and the store with it). Run by .github/workflows/neon-usage.yml; exits 1 (GitHub then
// emails the owner) when the warning applies. Read-only: it only reads usage from the Neon API.
//
//   NEON_API_KEY=... NEON_DATABASE_URL=postgresql://... node scripts/neon-usage.ts
//
// Plain TypeScript that Node runs directly (type stripping), so the workflow needs no install.

import { pathToFileURL } from 'node:url'

// The Neon compute ("endpoint") id from the store's connection string: the first label of the
// host, without the "-pooler" suffix of the pooled address.
export function endpointIdFromUrl(databaseUrl: string): string {
  const host = new URL(databaseUrl).hostname
  return host.split('.')[0].replace(/-pooler$/, '')
}

export type UsageInput = {
  computeSeconds: number // CU-seconds used so far this period (Neon's compute_time_seconds)
  periodStart?: string | null
  periodEnd?: string | null
  now: Date
  limitHours: number // the plan's CU-hours per period
  warnAtPercent: number
}

export type UsageReport = {
  usedHours: number
  percent: number
  projectedHours: number | null
  daysLeft: number | null
  warn: boolean
  reason: string
}

// Used hours, share of the allowance, and where the period is heading at the current pace. Warns
// when the share used passes warnAtPercent, or when the pace would use up the allowance before the
// period ends (judged only after the first 5 days, when a few busy days don't skew the pace).
export function usageReport(input: UsageInput): UsageReport {
  const usedHours = input.computeSeconds / 3600
  const percent = (usedHours / input.limitHours) * 100
  const start = input.periodStart ? Date.parse(input.periodStart) : NaN
  const end = input.periodEnd ? Date.parse(input.periodEnd) : NaN
  let projectedHours: number | null = null
  let daysLeft: number | null = null
  let elapsedDays = 0
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const now = input.now.getTime()
    elapsedDays = Math.max(0, (now - start) / 86_400_000)
    daysLeft = Math.max(0, (end - now) / 86_400_000)
    const periodDays = (end - start) / 86_400_000
    if (elapsedDays > 0) projectedHours = (usedHours / elapsedDays) * periodDays
  }
  if (percent >= input.warnAtPercent) {
    return { usedHours, percent, projectedHours, daysLeft, warn: true, reason: `${Math.round(percent)}% of the monthly ${input.limitHours} database hours are used` }
  }
  if (projectedHours !== null && elapsedDays >= 5 && projectedHours >= input.limitHours) {
    return { usedHours, percent, projectedHours, daysLeft, warn: true, reason: `at this pace the ${input.limitHours} monthly database hours run out before the month ends (about ${Math.round(projectedHours)} hours)` }
  }
  return { usedHours, percent, projectedHours, daysLeft, warn: false, reason: 'within the monthly allowance' }
}

async function neon(path: string, apiKey: string): Promise<any> {
  const response = await fetch(`https://console.neon.tech/api/v2${path}`, { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } })
  if (!response.ok) throw new Error(`Neon API ${path.split('?')[0]} answered ${response.status}${response.status === 401 ? ' (check the NEON_API_KEY secret)' : ''}`)
  return response.json()
}

export async function main() {
  const apiKey = process.env.NEON_API_KEY || ''
  const databaseUrl = process.env.NEON_DATABASE_URL || ''
  const limitHours = Number(process.env.NEON_LIMIT_HOURS || 100)
  const warnAtPercent = Number(process.env.NEON_WARN_AT_PERCENT || 70)
  if (!apiKey) throw new Error('NEON_API_KEY is not set: create an API key in the Neon Console (Account settings > API keys) and save it as a GitHub Actions secret')
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error('NEON_DATABASE_URL is not set')

  // The project whose compute the store connects to.
  const endpointId = endpointIdFromUrl(databaseUrl)
  const { projects = [] } = await neon('/projects?limit=100', apiKey)
  let project: any = null
  for (const candidate of projects) {
    const { endpoints = [] } = await neon(`/projects/${candidate.id}/endpoints`, apiKey)
    if (endpoints.some((e: any) => e.id === endpointId)) { project = candidate; break }
  }
  if (!project) throw new Error(`No Neon project with the store's compute (${endpointId}) is visible to this API key`)
  const details = (await neon(`/projects/${project.id}`, apiKey)).project || project

  const report = usageReport({
    computeSeconds: Number(details.compute_time_seconds || 0),
    periodStart: details.consumption_period_start,
    periodEnd: details.consumption_period_end,
    now: new Date(),
    limitHours,
    warnAtPercent,
  })
  const lines = [
    `Database hours used this period: ${report.usedHours.toFixed(1)} of ${limitHours} (${report.percent.toFixed(0)}%)`,
    report.projectedHours !== null ? `At this pace: about ${report.projectedHours.toFixed(0)} hours by the end of the period${report.daysLeft !== null ? ` (${report.daysLeft.toFixed(0)} days left)` : ''}` : 'Pace: not known yet (no billing period reported)',
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
