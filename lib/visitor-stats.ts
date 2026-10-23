// The arithmetic behind Admin > Live visitors: pure functions, so the numbers are easy to test.
import { STAGES, stageFromRank, type Stage } from '@/lib/visitor-tracking'
import { storeHourOf } from '@/lib/store-day'

// Whole percent of `whole` (0 when there is nothing to divide by), never above 100.
export function percent(part: number, whole: number) {
  if (!whole || whole <= 0 || !part || part <= 0) return 0
  return Math.min(100, Math.round((part / whole) * 100))
}

// "45 s", "3 min", "1 h 05 min": how long a visitor has been on the store.
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} h ${String(rest).padStart(2, '0')} min`
}

// Visits per hour of the store's day (24 numbers, midnight first).
export function hourlyCounts(times: Array<Date | string | number>, timezone: string) {
  const hours = Array.from({ length: 24 }, () => 0)
  for (const time of times) {
    const date = new Date(time)
    if (!Number.isFinite(date.getTime())) continue
    hours[storeHourOf(date, timezone)] += 1
  }
  return hours
}

export type CountRow = { key: string; count: number }

// "Group and count": the biggest first, equal counts in name order, anything beyond `limit` joined
// as one "Others" row. Empty values count as `emptyKey`.
export function topCounts(values: Array<string | null | undefined>, limit: number, emptyKey = 'Unknown'): CountRow[] {
  const map = new Map<string, number>()
  for (const value of values) {
    const key = String(value ?? '').trim() || emptyKey
    map.set(key, (map.get(key) || 0) + 1)
  }
  const rows = [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  if (rows.length <= limit) return rows
  const head = rows.slice(0, limit - 1)
  const others = rows.slice(limit - 1).reduce((sum, row) => sum + row.count, 0)
  return [...head, { key: 'Others', count: others }]
}

// Visitors online right now, by step, plus who has something in the cart.
export type OnlineVisitor = { reached: number; stage: Stage; cartItems: number; cartValue: number }
export function onlineSummary(visitors: Array<Pick<OnlineVisitor, 'stage' | 'cartItems' | 'cartValue'>>) {
  const byStage: Record<Stage, number> = { browsing: 0, product: 0, cart: 0, checkout: 0, ordered: 0 }
  let withCart = 0
  let cartValue = 0
  for (const v of visitors) {
    byStage[v.stage] += 1
    if (v.cartItems > 0) { withCart += 1; cartValue += Math.max(0, v.cartValue) }
  }
  return { online: visitors.length, byStage, withCart, cartValue }
}

// Today's funnel: of all visits, how many got as far as each step. `reached` is the furthest step of
// each visit (0 browsing ... 4 ordered). Each row also says how many of the previous step went on.
export type FunnelRow = { stage: Stage; count: number; ofAll: number; ofPrevious: number }
export function funnelToday(reached: number[]): FunnelRow[] {
  const total = reached.length
  let previous = total
  return STAGES.map((stage, index) => {
    const count = index === 0 ? total : reached.filter(r => r >= index).length
    const row = { stage: stageFromRank(index), count, ofAll: percent(count, total), ofPrevious: index === 0 ? 100 : percent(count, previous) }
    previous = count
    return row
  })
}

// Pages per visit with one decimal ("3.4"); "-" when there were no visits.
export function pagesPerVisit(pageViews: number, visits: number) {
  if (!visits) return '-'
  return (Math.round((pageViews / visits) * 10) / 10).toFixed(1)
}
