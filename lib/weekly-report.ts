import { internationalPhone } from '@/lib/phone'

// The owner's weekly report email: sent on Monday morning with the morning summary
// (app/api/internal/daily/route.ts), about the week that just ended (Monday to Sunday, store
// time) compared with the week before. The numbers are worked out here.

export const WEEKLY_REPORT_KEY = 'notifications.weeklyReport'
export const WEEKLY_REPORT_LAST = 'notifications.weeklyReportLast'

const shift = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export const isMonday = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`).getUTCDay() === 1

// For a Monday ("2026-10-19"): last week's first and last day, and the week before.
export function weekRanges(todayKey: string) {
  return {
    week: { from: shift(todayKey, -7), to: shift(todayKey, -1) },
    previous: { from: shift(todayKey, -14), to: shift(todayKey, -8) },
  }
}

export type WeekOrder = { dayKey: string; status: string; grandTotal: number; phone: string | null; area: string; items: Array<{ name: string; quantity: number; unitPrice: number }> }
export type WeeklyFacts = {
  from: string; to: string
  orders: number; sales: number; average: number; delivered: number; cancelled: number
  previousOrders: number; previousSales: number
  newCustomers: number; returningCustomers: number
  topProducts: Array<{ name: string; units: number }>
  topAreas: Array<{ area: string; orders: number }>
}

const inWeek = (key: string, range: { from: string; to: string }) => key >= range.from && key <= range.to

// `earlier` is every phone that ordered before the week started (cancelled orders don't count).
export function weeklyFacts(orders: WeekOrder[], todayKey: string, earlierPhones: Set<string>, storeCountry: string): WeeklyFacts {
  const { week, previous } = weekRanges(todayKey)
  const thisWeek = orders.filter(o => inWeek(o.dayKey, week))
  const kept = thisWeek.filter(o => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
  const before = orders.filter(o => inWeek(o.dayKey, previous) && o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
  const sales = kept.reduce((sum, o) => sum + o.grandTotal, 0)

  const units = new Map<string, number>()
  const areas = new Map<string, number>()
  const phones = new Set<string>()
  for (const o of kept) {
    for (const item of o.items) if (item.unitPrice > 0) units.set(item.name, (units.get(item.name) || 0) + item.quantity)
    if (o.area) areas.set(o.area, (areas.get(o.area) || 0) + 1)
    const phone = internationalPhone(o.phone, storeCountry)
    if (phone) phones.add(phone)
  }
  const returning = [...phones].filter(p => earlierPhones.has(p)).length
  return {
    from: week.from, to: week.to,
    orders: kept.length, sales, average: kept.length ? Math.round(sales / kept.length) : 0,
    delivered: kept.filter(o => o.status === 'DELIVERED').length,
    cancelled: thisWeek.length - kept.length,
    previousOrders: before.length, previousSales: before.reduce((sum, o) => sum + o.grandTotal, 0),
    newCustomers: phones.size - returning, returningCustomers: returning,
    topProducts: [...units].map(([name, n]) => ({ name, units: n })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)).slice(0, 5),
    topAreas: [...areas].map(([area, n]) => ({ area, orders: n })).sort((a, b) => b.orders - a.orders || a.area.localeCompare(b.area)).slice(0, 3),
  }
}

// "+25%" / "-10%" / "new" against the week before.
export function change(now: number, before: number) {
  if (!before) return now ? 'new' : ''
  const pct = Math.round(((now - before) / before) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

export function weekLabel(from: string, to: string) {
  const f = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
  return `${f(from, { day: 'numeric', month: 'short' })} to ${f(to, { day: 'numeric', month: 'short' })}`
}
