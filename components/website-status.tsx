import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, CircleMinus, Cloud, Database, DatabaseBackup, ExternalLink, GitBranch, HeartPulse, Mail, XCircle, type LucideIcon } from 'lucide-react'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { getCloudflareStatus, getDatabaseStatus, getEmailStatus, getGithubStatus, getUptimeStatus, type Run } from '@/lib/website-status'
import { summarize } from '@/lib/website-status-summary'
import { PLAN_LIMITS, formatBytes, formatCount, formatPercent, monitorTone, readableAction, runLabel, runTone, timeAgo, toneForShare, type Tone } from '@/lib/website-status-shared'
import WebsiteStatusChart from './website-status-chart'
import styles from './admin-website-status.module.css'
import ui from './admin-ui.module.css'

// The cards of Admin > Website status. Each is its own async server component, so the page
// streams: every card shows as soon as its own service has answered.

const PILL: Record<Tone, string> = { ok: ui.statusPillSuccess, warning: ui.statusPillWarning, critical: ui.statusPillDanger, off: styles.pillOff }
const PILL_ICON: Record<Tone, LucideIcon> = { ok: CheckCircle2, warning: AlertCircle, critical: XCircle, off: CircleMinus }
const PILL_TEXT: Record<Tone, string> = { ok: 'OK', warning: 'Check soon', critical: 'Act now', off: 'Not connected' }

export function TonePill({ tone, children }: { tone: Tone; children?: ReactNode }) {
  const Icon = PILL_ICON[tone]
  return <span className={`${ui.statusPill} ${PILL[tone]}`}><Icon size={14} aria-hidden="true" /> {children ?? PILL_TEXT[tone]}</span>
}

function When({ at, timezone }: { at: string | null | undefined; timezone: string }) {
  if (!at) return <>—</>
  return <time dateTime={at} title={formatAdminDateTime(at, timezone)}>{timeAgo(at)}</time>
}

function Card({ icon: Icon, title, subtitle, tone, link, wide, children }: { icon: LucideIcon; title: string; subtitle: string; tone?: Tone; link?: { href: string; label: string }; wide?: boolean; children: ReactNode }) {
  return <section className={`${ui.card} ${styles.card} ${wide ? styles.wide : ''}`}>
    <div className={styles.cardHead}>
      <div className={styles.cardTitle}><span className={styles.cardIcon}><Icon size={18} aria-hidden="true" /></span><div><h2>{title}</h2><p>{subtitle}</p></div></div>
      <div className={styles.headRight}>
        {link && <a className={styles.external} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} <ExternalLink size={12} aria-hidden="true" /></a>}
        {tone && <TonePill tone={tone} />}
      </div>
    </div>
    {children}
  </section>
}

export function CardSkeleton({ icon, title, subtitle, wide }: { icon: LucideIcon; title: string; subtitle: string; wide?: boolean }) {
  return <Card icon={icon} title={title} subtitle={subtitle} wide={wide}><div className={styles.skeleton} aria-label="Loading"><span /><span /><span /></div></Card>
}

// Title, icon and one-line description of each card, shared with its loading placeholder.
export const CARDS = {
  database: { icon: Database, title: 'Database', subtitle: 'Neon · where products, orders and customers are stored', wide: true },
  backups: { icon: DatabaseBackup, title: 'Backups', subtitle: 'A full copy of the database every night, kept 30 days' },
  cloudflare: { icon: Cloud, title: 'Website & hosting', subtitle: 'Cloudflare · visits, errors, images and updates' },
  email: { icon: Mail, title: 'Emails', subtitle: 'Resend · order confirmations and password resets' },
  uptime: { icon: HeartPulse, title: 'Uptime', subtitle: 'Better Stack · checks the website around the clock' },
  github: { icon: GitBranch, title: 'Code & automatic jobs', subtitle: 'GitHub · website updates, nightly backup, database hours check' },
} as const

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className={styles.tile}><span className={styles.tileLabel}>{label}</span><span className={styles.tileValue}>{value}</span>{sub && <span className={styles.tileSub}>{sub}</span>}</div>
}

function Meter({ label, used, limit, text, note }: { label: string; used: number; limit: number; text: string; note?: ReactNode }) {
  const tone = toneForShare(used, limit)
  const track = tone === 'critical' ? styles.trackCritical : tone === 'warning' ? styles.trackWarning : ''
  const share = Math.min(100, Math.max(0, (used / limit) * 100))
  return <div className={styles.meter}>
    <div className={styles.meterTop}><strong>{label}</strong><span>{text} · {formatPercent(used, limit)}</span></div>
    <div className={`${styles.track} ${track}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-valuetext={`${text}, ${formatPercent(used, limit)}`}>
      <div className={styles.fill} style={{ width: `${share}%`, minWidth: used > 0 ? undefined : 0 }} />
    </div>
    {note && <span className={styles.meterNote}>{note}</span>}
  </div>
}

function NotConnected({ missing, what }: { missing: string[]; what: string }) {
  return <div className={styles.notice}>
    <strong>Not connected yet</strong>
    <span>{what}</span>
    <span>Needs {missing.map((m, i) => <span key={m}>{i ? ' and ' : ''}<code>{m}</code></span>)} in GitHub (Settings &gt; Secrets and variables &gt; Actions). The next website update connects it.</span>
  </div>
}

function Problem({ message, title = 'Couldn\u2019t load this right now' }: { message: string; title?: string }) {
  return <div className={`${styles.notice} ${styles.noticeError}`}><strong>{title}</strong><span>{message}</span></div>
}

function plural(count: number, one: string, many = `${one}s`) { return `${formatCount(count)} ${count === 1 ? one : many}` }

// ---------------------------------------------------------------- Summary

export async function StatusSummary({ timezone }: { timezone: string }) {
  const [database, cloudflare, email, uptime, github] = await Promise.all([getDatabaseStatus(), getCloudflareStatus(), getEmailStatus(), getUptimeStatus(), getGithubStatus()])
  const summary = summarize({ database, cloudflare, email, uptime, github })
  const now = new Date().toISOString()
  const headline = summary.tone === 'critical' ? 'Something needs action now' : summary.tone === 'warning' ? 'A few things need a look' : summary.tone === 'ok' ? 'Everything looks good' : 'Nothing connected yet'
  return <section className={`${ui.card} ${styles.summary}`} aria-live="polite">
    <div className={styles.summaryHead}><h2>{headline}</h2><TonePill tone={summary.tone} /></div>
    {summary.issues.length
      ? <ul className={styles.issues}>{summary.issues.map(issue => {
          const Icon = issue.tone === 'critical' ? XCircle : AlertCircle
          return <li key={issue.text} className={`${styles.issue} ${issue.tone === 'critical' ? styles.issueCritical : styles.issueWarning}`}><Icon size={16} aria-hidden="true" /><span>{issue.text}</span></li>
        })}</ul>
      : <p className={styles.allGood}>The database, website, emails and automatic jobs that are connected are all working within their limits.</p>}
    {summary.notConnected.length > 0 && <p className={styles.small}>Not connected yet: {summary.notConnected.join(', ')}.</p>}
    <span className={styles.stamp}>Checked {formatAdminDateTime(now, timezone)}</span>
  </section>
}

// ---------------------------------------------------------------- Database

export async function DatabaseCard({ timezone }: { timezone: string }) {
  const [section, github] = await Promise.all([getDatabaseStatus(), getGithubStatus()])
  const props = { ...CARDS.database, link: { href: 'https://console.neon.tech', label: 'Neon' } }
  if (section.state !== 'ready') return <Card {...props} tone={section.tone}>{section.state === 'error' && <Problem message={section.message} />}</Card>
  const d = section.data
  const usage = github.state === 'ready' ? github.data.neonUsage : null
  const hoursTone: Tone = usage ? (usage.warning ? 'warning' : toneForShare(usage.usedHours, usage.limitHours)) : 'ok'
  const biggest = d.tables[0]?.bytes || 1
  return <Card {...props} tone={[section.tone, hoursTone].includes('critical') ? 'critical' : [section.tone, hoursTone].includes('warning') ? 'warning' : 'ok'}>
    <Meter label="Size" used={d.sizeBytes} limit={PLAN_LIMITS.databaseBytes} text={`${formatBytes(d.sizeBytes)} of ${formatBytes(PLAN_LIMITS.databaseBytes)}`} />
    {usage
      ? <Meter label="Database hours this month" used={usage.usedHours} limit={usage.limitHours} text={`${usage.usedHours.toFixed(1)} of ${usage.limitHours} h`} note={<>{usage.projectedHours !== null ? `At this pace about ${Math.round(usage.projectedHours)} h by the end of the month` : 'Pace not known yet'}{usage.daysLeft !== null ? ` · ${Math.round(usage.daysLeft)} days left` : ''} · checked <When at={github.state === 'ready' ? github.data.usage?.createdAt : null} timezone={timezone} /></>} />
      : <p className={styles.small}>Database hours this month show here once GitHub is connected (they come from the daily check).</p>}
    <div className={`${styles.tiles} ${styles.tiles4}`}>
      <Tile label="Orders, last 24 h" value={formatCount(d.orders24h)} sub={<>Last order <When at={d.lastOrderAt} timezone={timezone} /></>} />
      <Tile label="Orders, last 7 days" value={formatCount(d.orders7d)} />
      <Tile label="New customers, 7 days" value={formatCount(d.customers7d)} />
      <Tile label="Admin changes, 24 h" value={formatCount(d.changes24h)} />
    </div>
    <div className={styles.inline}><span>{plural(d.counts.products, 'product')}</span><span>{plural(d.counts.orders, 'order')}</span><span>{plural(d.counts.customers, 'customer')}</span><span>{plural(d.counts.media, 'image')}</span></div>
    <div className={styles.grid}>
      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Biggest tables</h3>
        <ul className={styles.rows}>{d.tables.map(t => <li key={t.name} className={styles.row}><span className={styles.rowMain}><strong>{t.name}</strong><span className={styles.tableBar} style={{ width: `${Math.max(4, (t.bytes / biggest) * 100)}%` }} /></span><span className={styles.rowSide}>{formatBytes(t.bytes)}</span></li>)}</ul>
      </div>
      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Latest changes in the admin</h3>
        {d.activity.length
          ? <ul className={styles.rows}>{d.activity.map((a, i) => <li key={`${a.at}-${i}`} className={styles.row}><span className={styles.rowMain}><strong>{readableAction(a.action)}</strong><span>{a.actor || 'System'}</span></span><span className={styles.rowSide}><When at={a.at} timezone={timezone} /></span></li>)}</ul>
          : <p className={styles.small}>No changes recorded yet.</p>}
        <a className={styles.link} href="/admin/activity">Full activity log</a>
      </div>
    </div>
    <p className={styles.small}>PostgreSQL {d.version}</p>
  </Card>
}

// ---------------------------------------------------------------- Backups

export async function BackupCard({ timezone }: { timezone: string }) {
  const github = await getGithubStatus()
  const props = CARDS.backups
  if (github.state === 'not-connected') return <Card {...props} tone="off"><NotConnected missing={github.missing} what="Shows when the last nightly copy was made, its size, and whether it restored correctly." /></Card>
  if (github.state === 'error') return <Card {...props} tone={github.tone}><Problem message={github.message} /></Card>
  const run = github.data.backup
  const result = github.data.backupResult
  const stale = run && Date.now() - new Date(run.createdAt).getTime() > 36 * 3_600_000
  const tone: Tone = !run ? 'warning' : runTone(run) === 'ok' && stale ? 'warning' : runTone(run)
  return <Card {...props} tone={tone} link={run ? { href: run.url, label: 'Details' } : undefined}>
    <div className={styles.tiles}>
      <Tile label="Last backup" value={run ? <When at={run.createdAt} timezone={timezone} /> : '—'} sub={run ? runLabel(run) : 'No backup has run yet'} />
      <Tile label="Size" value={result ? formatBytes(result.bytes) : '—'} sub={result?.tables ? `${result.tables} tables` : undefined} />
    </div>
    {result && <p className={styles.small}>{result.verified ? 'Checked by restoring it into a test database: all rows matched.' : 'Saved.'} File {result.name}.</p>}
    {stale && <p className={styles.small}>No backup in the last day and a half: the nightly job may be paused (GitHub pauses scheduled jobs after 60 days without changes to the code).</p>}
  </Card>
}

// ---------------------------------------------------------------- Cloudflare

export async function CloudflareCard({ timezone }: { timezone: string }) {
  const section = await getCloudflareStatus()
  const props = { ...CARDS.cloudflare, link: { href: 'https://dash.cloudflare.com', label: 'Cloudflare' } }
  if (section.state !== 'ready') return <Card {...props} tone={section.tone}>{section.state === 'error' ? <Problem message={section.message} /> : null}</Card>
  const c = section.data
  const weekRequests = c.traffic?.days.reduce((s, d) => s + d.requests, 0) || 0
  const weekErrors = c.traffic?.days.reduce((s, d) => s + d.errors, 0) || 0
  return <Card {...props} tone={section.tone}>
    {c.traffic
      ? <>
          <div className={styles.block}><h3 className={styles.blockTitle}>Requests per day, last 7 days</h3><WebsiteStatusChart days={c.traffic.days} /></div>
          <Meter label="Requests this month" used={c.traffic.monthRequests} limit={PLAN_LIMITS.workerRequests} text={`${formatCount(c.traffic.monthRequests)} of ${formatCount(PLAN_LIMITS.workerRequests)} included`} />
        </>
      : c.trafficIssue && 'missing' in c.trafficIssue
        ? <NotConnected missing={c.trafficIssue.missing} what="Shows how many requests the website answers each day and how many failed." />
        : c.trafficIssue && <Problem message={c.trafficIssue.message} />}
    <div className={styles.tiles}>
      {c.traffic && <Tile label="Errors, last 7 days" value={formatCount(weekErrors)} sub={weekRequests ? `${formatPercent(weekErrors, weekRequests)} of requests` : undefined} />}
      <Tile label="Last website update" value={<When at={c.deployedAt} timezone={timezone} />} />
    </div>
    {c.media
      ? <Meter label="Images stored" used={c.media.bytes} limit={PLAN_LIMITS.mediaBytes} text={`${formatBytes(c.media.bytes)} of ${formatBytes(PLAN_LIMITS.mediaBytes)} free`} note={`${formatCount(c.media.files)}${c.media.partial ? '+' : ''} files`} />
      : <p className={styles.small}>Image storage size is only available on the live website.</p>}
  </Card>
}

// ---------------------------------------------------------------- Emails

export async function EmailCard({ timezone }: { timezone: string }) {
  const section = await getEmailStatus()
  const props = { ...CARDS.email, link: { href: 'https://resend.com/emails', label: 'Resend' } }
  if (section.state !== 'ready') return <Card {...props} tone={section.tone}>{section.state === 'error' && <Problem message={section.message} />}</Card>
  const e = section.data
  return <Card {...props} tone={section.tone}>
    {!e.configured && <Problem title="Emails are not being sent" message="Email sending is not set up (RESEND_API_KEY / EMAIL_FROM): customers get no order confirmations." />}
    <div className={styles.tiles}>
      <Tile label="Sent, last 24 h" value={formatCount(e.sent24h)} sub={`of ${PLAN_LIMITS.emailsPerDay} a day (free plan)`} />
      <Tile label="Sent this month" value={formatCount(e.sentMonth)} sub={`of ${PLAN_LIMITS.emailsPerMonth.toLocaleString('en-US')} (free plan)`} />
      <Tile label="Failed, 7 days" value={formatCount(e.failed7d)} sub={e.skipped7d ? `${e.skipped7d} not sent (email not set up)` : undefined} />
    </div>
    {e.from && <p className={styles.small}>Sent from {e.from} (change it in Settings &gt; Email &gt; Sender)</p>}
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>Latest emails</h3>
      {e.recent.length
        ? <ul className={styles.rows}>{e.recent.map((m, i) => <li key={`${m.at}-${i}`} className={styles.row}>
            <span className={styles.rowMain}><strong>{m.subject}</strong><span>{m.to}</span>{m.error && <span className={m.status === 'failed' ? styles.rowError : undefined}>{m.error}</span>}</span>
            <span className={styles.rowSide}><TonePill tone={m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'critical' : 'warning'}>{m.status === 'sent' ? 'Sent' : m.status === 'failed' ? 'Failed' : 'Not sent'}</TonePill><br /><When at={m.at} timezone={timezone} /></span>
          </li>)}</ul>
        : <p className={styles.small}>No emails recorded yet. Emails are recorded from this update on.</p>}
    </div>
  </Card>
}

// ---------------------------------------------------------------- Uptime

export async function UptimeCard({ timezone }: { timezone: string }) {
  const section = await getUptimeStatus()
  const props = { ...CARDS.uptime, link: { href: 'https://uptime.betterstack.com', label: 'Better Stack' } }
  if (section.state === 'not-connected') return <Card {...props} tone="off"><NotConnected missing={section.missing} what="Shows whether yallahaul.com is up right now and how much of the last 30 days it was up." /></Card>
  if (section.state === 'error') return <Card {...props} tone={section.tone}><Problem message={section.message} /></Card>
  return <Card {...props} tone={section.tone}>
    {section.data.monitors.length
      ? <ul className={styles.rows}>{section.data.monitors.map(m => <li key={m.url || m.name} className={styles.row}>
          <span className={styles.rowMain}><strong>{m.name}</strong><span>{m.availability !== null ? `${m.availability.toFixed(2)}% up in the last 30 days` : 'Uptime not known yet'}{m.incidents ? ` · ${m.incidents} incident${m.incidents === 1 ? '' : 's'}` : ''} · checked <When at={m.lastCheckedAt} timezone={timezone} /></span></span>
          <span className={styles.rowSide}><TonePill tone={monitorTone(m.status)}>{m.status === 'up' ? 'Up' : m.status === 'down' ? 'Down' : m.status[0].toUpperCase() + m.status.slice(1)}</TonePill></span>
        </li>)}</ul>
      : <p className={styles.small}>Better Stack has no monitors yet.</p>}
  </Card>
}

// ---------------------------------------------------------------- GitHub

function RunRow({ label, run, timezone, tone }: { label: string; run: Run | null; timezone: string; tone?: Tone }) {
  return <li className={styles.row}>
    <span className={styles.rowMain}><strong>{label}</strong><span>{run ? <><When at={run.createdAt} timezone={timezone} /> · <a className={styles.link} href={run.url} target="_blank" rel="noopener noreferrer">details</a></> : 'No runs yet'}</span></span>
    <span className={styles.rowSide}><TonePill tone={tone ?? runTone(run)}>{runLabel(run)}</TonePill></span>
  </li>
}

export async function GithubCard({ timezone }: { timezone: string }) {
  const section = await getGithubStatus()
  const props = CARDS.github
  if (section.state === 'not-connected') return <Card {...props} tone="off"><NotConnected missing={section.missing} what="Shows whether the last website update, the nightly backup and the daily database hours check worked." /></Card>
  if (section.state === 'error') return <Card {...props} tone={section.tone}><Problem message={section.message} /></Card>
  const g = section.data
  const usageTone: Tone = g.usage?.conclusion === 'failure' && g.neonUsage?.warning ? 'warning' : runTone(g.usage)
  return <Card {...props} tone={section.tone} link={{ href: `https://github.com/${g.repo}/actions`, label: 'GitHub' }}>
    <ul className={styles.rows}>
      <RunRow label="Website update (deploy)" run={g.deploy} timezone={timezone} />
      <RunRow label="Nightly backup" run={g.backup} timezone={timezone} />
      <RunRow label="Database hours check" run={g.usage} timezone={timezone} tone={usageTone} />
    </ul>
  </Card>
}
