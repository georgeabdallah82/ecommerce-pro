// The store's running costs in Reports > Profit: rent, salaries, internet... A monthly cost
// counts every month from its start to its end (or for good); a one-off counts on its day. A
// report that covers part of a month counts that part: 10 days of a 30-day month is 1/3 of it.

export type Expense = { id: string; name: string; amount: number; currency: string; monthly: boolean; startsOn: Date | string; endsOn: Date | string | null }
export type ExpenseLine = { id: string; name: string; monthly: boolean; amount: number }

const DAY = 86400000
const utcDay = (value: Date | string) => { const d = new Date(value); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }

// The share of each expense inside [since, until) (whole UTC days, until excluded).
export function expensesInRange(expenses: Expense[], since: Date, until: Date, currency: string) {
  const from = utcDay(since), to = utcDay(until)
  const lines: ExpenseLine[] = []
  for (const e of expenses) {
    if (e.currency !== currency || e.amount <= 0) continue
    const start = utcDay(e.startsOn)
    if (!e.monthly) {
      if (start >= from && start < to) lines.push({ id: e.id, name: e.name, monthly: false, amount: e.amount })
      continue
    }
    const end = e.endsOn ? utcDay(e.endsOn) + DAY : Number.POSITIVE_INFINITY // endsOn is the last day it counts
    const a = Math.max(from, start), b = Math.min(to, end)
    if (b <= a) continue
    let total = 0
    // Month by month: each month's cost is spread over its own number of days.
    let cursor = a
    while (cursor < b) {
      const d = new Date(cursor)
      const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
      const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
      const daysInMonth = Math.round((nextMonth - monthStart) / DAY)
      const stop = Math.min(b, nextMonth)
      total += e.amount * Math.round((stop - cursor) / DAY) / daysInMonth
      cursor = stop
    }
    lines.push({ id: e.id, name: e.name, monthly: true, amount: Math.round(total) })
  }
  return { total: lines.reduce((sum, l) => sum + l.amount, 0), lines: lines.sort((x, y) => y.amount - x.amount) }
}

// A date typed in the form, "YYYY-MM-DD" or "YYYY-MM" (the 1st of that month).
export function readExpenseDate(raw: unknown): Date | null {
  const v = String(raw ?? '').trim()
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)))
  return Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(m[2]) - 1 ? null : d
}
