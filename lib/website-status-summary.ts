import type { CloudflareStatus, DatabaseStatus, EmailStatus, GithubStatus, Section, UptimeStatus } from '@/lib/website-status'
import { PLAN_LIMITS, formatBytes, formatPercent, monitorTone, toneForShare, worstTone, type Tone } from '@/lib/website-status-shared'

export type StatusSections = {
  database: Section<DatabaseStatus>
  cloudflare: Section<CloudflareStatus>
  email: Section<EmailStatus>
  uptime: Section<UptimeStatus>
  github: Section<GithubStatus>
}

export type Issue = { tone: Exclude<Tone, 'off' | 'ok'>; text: string }
export type Summary = { tone: Tone; issues: Issue[]; notConnected: string[] }

const NAMES: Record<keyof StatusSections, string> = { database: 'Database', cloudflare: 'Cloudflare traffic', email: 'Emails', uptime: 'Uptime (Better Stack)', github: 'GitHub (deploys, backups, database hours)' }

// The short list at the top of Website status: what needs a look, most urgent first, in words
// the owner can act on. Sections that aren't connected are listed separately, not as problems.
export function summarize(sections: StatusSections, now: Date = new Date()): Summary {
  const issues: Issue[] = []
  const notConnected: string[] = []
  const add = (tone: Tone, text: string) => { if (tone === 'warning' || tone === 'critical') issues.push({ tone, text }) }

  for (const key of Object.keys(NAMES) as (keyof StatusSections)[]) {
    const section = sections[key]
    if (section.state === 'not-connected') notConnected.push(NAMES[key])
    else if (section.state === 'error') add(section.tone === 'ok' || section.tone === 'off' ? 'warning' : section.tone, `${NAMES[key]}: ${section.message}`)
  }

  const { database, cloudflare, email, uptime, github } = sections
  if (database.state === 'ready') {
    const d = database.data
    add(toneForShare(d.sizeBytes, PLAN_LIMITS.databaseBytes), `The database uses ${formatBytes(d.sizeBytes)} of its free ${formatBytes(PLAN_LIMITS.databaseBytes)} (${formatPercent(d.sizeBytes, PLAN_LIMITS.databaseBytes)}).`)
  }

  if (github.state === 'ready') {
    const g = github.data
    if (g.neonUsage) {
      const u = g.neonUsage
      const usedTone = toneForShare(u.usedHours, u.limitHours)
      if (usedTone !== 'ok') add(usedTone, `Database hours: ${u.usedHours.toFixed(1)} of ${u.limitHours} used this month.`)
      else if (u.warning || (u.projectedHours !== null && u.projectedHours >= u.limitHours)) add('warning', `Database hours: at this pace about ${Math.round(u.projectedHours ?? u.usedHours)} of ${u.limitHours} by the end of the month.`)
    }
    if (g.deploy?.status === 'completed' && g.deploy.conclusion === 'failure') add('critical', 'The last website update failed to go live (GitHub > Actions has the details).')
    if (g.backup?.conclusion === 'failure') add('critical', 'The last nightly backup failed.')
    else if (g.backup && now.getTime() - new Date(g.backup.createdAt).getTime() > 36 * 3_600_000) add('warning', 'No database backup in the last day and a half.')
    else if (!g.backup) add('warning', 'No database backup has run yet.')
  }

  if (cloudflare.state === 'ready') {
    const c = cloudflare.data
    if (c.traffic) {
      add(toneForShare(c.traffic.monthRequests, PLAN_LIMITS.workerRequests), `Website visits this month are at ${formatPercent(c.traffic.monthRequests, PLAN_LIMITS.workerRequests)} of the 10 million requests included.`)
      const requests = c.traffic.days.reduce((s, d) => s + d.requests, 0)
      const errors = c.traffic.days.reduce((s, d) => s + d.errors, 0)
      if (requests >= 100 && errors / requests >= 0.02) add('warning', `${formatPercent(errors, requests)} of website requests failed in the last 7 days.`)
    }
    if (c.trafficIssue && 'message' in c.trafficIssue) add('warning', `Cloudflare traffic: ${c.trafficIssue.message}`)
    if (c.trafficIssue && 'missing' in c.trafficIssue) notConnected.push(NAMES.cloudflare)
    if (c.media) add(toneForShare(c.media.bytes, PLAN_LIMITS.mediaBytes), `Images use ${formatBytes(c.media.bytes)} of the free ${formatBytes(PLAN_LIMITS.mediaBytes)}.`)
  }

  if (email.state === 'ready') {
    const e = email.data
    if (!e.configured) add('critical', 'Emails are not set up: customers get no order confirmations.')
    if (e.failed7d) add('warning', `${e.failed7d} email${e.failed7d === 1 ? '' : 's'} could not be sent in the last 7 days.`)
    add(toneForShare(e.sent24h, PLAN_LIMITS.emailsPerDay), `${e.sent24h} emails sent in the last 24 hours, of the ${PLAN_LIMITS.emailsPerDay} a day Resend's free plan allows.`)
    add(toneForShare(e.sentMonth, PLAN_LIMITS.emailsPerMonth), `${e.sentMonth} emails sent this month, of the ${PLAN_LIMITS.emailsPerMonth.toLocaleString('en-US')} Resend's free plan allows.`)
  }

  if (uptime.state === 'ready') {
    for (const m of uptime.data.monitors) {
      const tone = monitorTone(m.status)
      if (tone === 'critical') add('critical', `${m.name} is down right now (Better Stack).`)
      else if (tone === 'warning') add('warning', `${m.name} is ${m.status} in Better Stack.`)
    }
    if (!uptime.data.monitors.length) add('warning', 'Better Stack has no monitors.')
  }

  issues.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'critical' ? -1 : 1))
  const tone = issues.length ? worstTone(issues.map(i => i.tone)) : notConnected.length === Object.keys(NAMES).length ? 'off' : 'ok'
  return { tone, issues, notConnected }
}
