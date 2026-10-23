import type { NeonUsage } from '@/lib/website-status-shared'

// Plain-words advice from the daily database-hours check (scripts/neon-usage.ts, read through the
// Website status page). Neon's free plan includes 100 compute hours a month and stops the database --
// and the store with it -- when they run out. A store with visitors around the clock keeps the database
// awake all day (its smallest size is a quarter of a compute unit: about 6 hours a day), so the free
// hours last roughly two weeks of real traffic.

export type HoursAdvice = {
  level: 'ok' | 'watch' | 'urgent'
  percent: number
  // Days until the hours are gone at the current pace, or null when the pace is unknown or zero.
  runsOutInDays: number | null
  // One short line for the morning summary and the launch checklist.
  short: string
  // The longer explanation with what to do.
  text: string
}

const round = (n: number) => Math.round(n * 10) / 10

export function databaseHoursAdvice(usage: NeonUsage | null | undefined): HoursAdvice | null {
  if (!usage || !Number.isFinite(usage.usedHours) || !Number.isFinite(usage.limitHours) || usage.limitHours <= 0) return null
  const used = usage.usedHours
  const limit = usage.limitHours
  const percent = Math.round((used / limit) * 100)
  const daysLeft = usage.daysLeft
  let perDay: number | null = null
  if (usage.projectedHours !== null && daysLeft !== null && daysLeft > 0) perDay = Math.max(0, (usage.projectedHours - used) / daysLeft)
  const runsOutInDays = perDay && perDay > 0 ? Math.max(0, (limit - used) / perDay) : null
  const runsOutEarly = runsOutInDays !== null && daysLeft !== null && runsOutInDays < daysLeft
  const earlyBy = runsOutEarly && daysLeft !== null && runsOutInDays !== null ? daysLeft - runsOutInDays : 0

  const level: HoursAdvice['level'] = percent >= 85 || earlyBy >= 2 ? 'urgent'
    : percent >= 50 || runsOutEarly || (usage.projectedHours !== null && usage.projectedHours >= limit * 0.8) ? 'watch'
      : 'ok'

  const base = `${round(used)} of ${limit} database hours used this month`
  const pace = runsOutInDays !== null && daysLeft !== null
    ? runsOutEarly ? `; at this pace they run out in about ${Math.max(1, Math.round(runsOutInDays))} day${Math.round(runsOutInDays) === 1 ? '' : 's'}, before the month ends`
      : `; about ${Math.round(usage.projectedHours ?? used)} by the end of the month at this pace`
    : ''
  const short = `Database hours: ${round(used)} of ${limit} used${level === 'ok' ? '' : runsOutEarly ? ' (running out early)' : ''}`
  const advice = level === 'ok'
    ? 'This is fine for now.'
    : 'Real visitors keep the database awake all day (about 6 hours a day), so the free hours would be gone in about two weeks and the store would stop until the month renews. Before you launch, move the database to Neon\'s pay-as-you-go plan (Neon > Billing).'
  return { level, percent, runsOutInDays, short, text: `${base}${pace}. ${advice}` }
}
