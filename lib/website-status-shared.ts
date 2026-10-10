// Pure helpers for Admin > Website status: the limits of the plans the store runs on, reading
// what the scheduled GitHub workflows print, and number/time formatting. No server imports, so
// the page's client parts and the tests use them too.

// Free allowances of the plans in use, checked October 2026. Change them here if a plan changes.
export const PLAN_LIMITS = {
  databaseBytes: 1024 ** 3, // Neon Free: 1 GB per project
  databaseHours: 100, // Neon Free: 100 CU-hours per project per month
  workerRequests: 10_000_000, // Cloudflare Workers Paid: 10 million requests a month included
  mediaBytes: 10 * 1024 ** 3, // Cloudflare R2: 10 GB stored free
  emailsPerDay: 100, // Resend Free: 100 emails a day
  emailsPerMonth: 3000, // Resend Free: 3,000 emails a month
} as const

// ok = fine, warning = look soon, critical = act now, off = not connected or not known.
export type Tone = 'ok' | 'warning' | 'critical' | 'off'

export function worstTone(tones: Tone[]): Tone {
  if (tones.includes('critical')) return 'critical'
  if (tones.includes('warning')) return 'warning'
  if (tones.includes('ok')) return 'ok'
  return 'off'
}

// How close a usage is to its limit: from 70% it's worth knowing, from 90% it needs action.
export function toneForShare(used: number, limit: number): Tone {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 'off'
  const share = used / limit
  return share >= 0.9 ? 'critical' : share >= 0.7 ? 'warning' : 'ok'
}

// A few failed requests are normal; 2% of at least 100 requests is not.
export function errorRateTooHigh(window: { requests: number; errors: number }): boolean {
  return window.requests >= 100 && window.errors / window.requests >= 0.02
}

// Cloudflare's outcome for failed Worker requests, in plain words.
export function errorKindLabel(status: string): string {
  if (/^exceeded/i.test(status)) return 'Needed more processing than the plan allows'
  if (status === 'scriptThrewException') return 'Error in the website\u2019s code'
  if (status === 'clientDisconnected') return 'Visitor left before the page finished'
  if (/internal/i.test(status)) return 'Cloudflare had an internal problem'
  if (status === 'responseStreamDisconnected') return 'Page was cut off while sending'
  return status
}

export type NeonUsage = { usedHours: number; limitHours: number; projectedHours: number | null; daysLeft: number | null; warning: boolean }

// The lines scripts/neon-usage.ts prints (GitHub prefixes each log line with a timestamp).
export function parseNeonUsageLog(log: string): NeonUsage | null {
  const used = /Database hours used this period: ([\d.]+) of ([\d.]+)/.exec(log)
  if (!used) return null
  const pace = /At this pace: about ([\d.]+) hours by the end of the period(?: \(([\d.]+) days left\))?/.exec(log)
  return {
    usedHours: Number(used[1]),
    limitHours: Number(used[2]),
    projectedHours: pace ? Number(pace[1]) : null,
    daysLeft: pace && pace[2] !== undefined ? Number(pace[2]) : null,
    warning: /WARNING: /.test(log),
  }
}

export type BackupResult = { name: string; bytes: number; tables: number | null; verified: boolean }

// The lines .github/workflows/database-backup.yml prints. The step's own script is echoed into
// the log too, but there the size and table count are shell variables, not digits.
export function parseBackupLog(log: string): BackupResult | null {
  const saved = /Saved (\S+\.dump) \((\d+) bytes\)/.exec(log)
  if (!saved) return null
  const tables = /Tables: (\d+),/.exec(log)
  return {
    name: saved[1],
    bytes: Number(saved[2]),
    tables: tables ? Number(tables[1]) : null,
    verified: /The copy restores with the same rows as the live database\./.test(log),
  }
}

export type RunInfo = { status: string; conclusion: string | null }

export function runTone(run: RunInfo | null): Tone {
  if (!run) return 'off'
  if (run.status !== 'completed') return 'ok'
  if (run.conclusion === 'success') return 'ok'
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'startup_failure') return 'critical'
  return 'warning'
}

export function runLabel(run: RunInfo | null): string {
  if (!run) return 'No runs yet'
  if (run.status !== 'completed') return 'Running now'
  if (run.conclusion === 'success') return 'Succeeded'
  if (run.conclusion === 'failure') return 'Failed'
  if (run.conclusion === 'cancelled') return 'Cancelled'
  if (run.conclusion === 'skipped') return 'Skipped'
  return run.conclusion ? run.conclusion.replace(/_/g, ' ') : 'Unknown'
}

// Better Stack monitor states.
export function monitorTone(status: string): Tone {
  if (status === 'up') return 'ok'
  if (status === 'down') return 'critical'
  if (status === 'paused' || status === 'maintenance' || status === 'pending' || status === 'validating') return 'warning'
  return 'off'
}

// "order.note_added" -> "Order note added"
export function readableAction(action: string): string {
  const words = String(action || '').replace(/[._]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Change'
}

// The last `days` UTC calendar days ending with `now`'s day, oldest first, as YYYY-MM-DD.
export function lastDays(now: Date, days: number): string[] {
  const out: string[] = []
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = days - 1; i >= 0; i--) out.push(new Date(today - i * 86_400_000).toISOString().slice(0, 10))
  return out
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`
}

// 1,284 / 12.9K / 4.2M
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs < 10_000) return Math.round(value).toLocaleString('en-US')
  if (abs < 1_000_000) return `${(value / 1000).toFixed(abs < 100_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export function formatPercent(used: number, limit: number): string {
  if (!limit) return '—'
  const share = (used / limit) * 100
  return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`
}

export function timeAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}
