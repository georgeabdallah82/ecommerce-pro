// The owner's morning summary and the review-request emails: run once a day by the Worker's cron
// (worker.ts scheduled() -> /api/internal/daily, about 8:30 Beirut time). The words and numbers
// are worked out here; app/api/internal/daily/route.ts reads the database and sends.

export type DailySummaryFacts = {
  storeName: string
  dayLabel: string
  currency: string
  ordersYesterday: number
  salesYesterday: number
  toConfirm: number
  toPrepare: number
  outForDelivery: number
  lowStock: Array<{ name: string; left: number }>
  pendingReviews: number
  reviewEmailsSent: number
}

type Money = (cents: number, currency: string) => string
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// The store's calendar day ("2026-10-16") for an instant, in the store's timezone.
export function storeDayKey(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

// "Yesterday" for a job that runs in the morning: the store day 24 hours before now.
export function yesterdayKey(now: Date, timezone: string) {
  return storeDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone)
}

export function dayLabel(now: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  } catch {
    return yesterdayKey(now, timezone)
  }
}

export function waitingLines(f: DailySummaryFacts) {
  return [
    f.toConfirm ? `${plural(f.toConfirm, 'order')} to confirm` : '',
    f.toPrepare ? `${plural(f.toPrepare, 'order')} to prepare` : '',
    f.outForDelivery ? `${plural(f.outForDelivery, 'order')} out for delivery` : '',
    f.lowStock.length ? `${plural(f.lowStock.length, 'product')} low on stock` : '',
    f.pendingReviews ? `${plural(f.pendingReviews, 'review')} to approve` : '',
  ].filter(Boolean)
}

export function dailySummaryMessage(f: DailySummaryFacts, money: Money) {
  const sales = money(f.salesYesterday, f.currency)
  const yesterday = f.ordersYesterday ? `${plural(f.ordersYesterday, 'order')} · ${sales}` : 'no orders'
  const waiting = waitingLines(f)
  return {
    subject: `${f.storeName ? `${f.storeName}: ` : ''}yesterday ${yesterday}${f.toConfirm ? ` · ${f.toConfirm} to confirm` : ''}`,
    push: {
      title: `Good morning! Yesterday: ${yesterday}`,
      body: waiting.length ? waiting.join(' · ') : 'Nothing waiting for you. Have a good day!',
    },
    waiting,
    sales,
  }
}

// Orders that get the "how was your order?" email: delivered 1 to 5 days ago, with an email
// address, not asked before and not already reviewed.
export const REVIEW_REQUEST_AFTER_MS = 20 * 60 * 60 * 1000
export const REVIEW_REQUEST_UNTIL_MS = 5 * 24 * 60 * 60 * 1000
export const REVIEW_REQUEST_MARK = 'Review request sent by email.'
export const REVIEW_REQUESTS_PER_DAY = 40

export function reviewRequestWindow(now: Date) {
  return { deliveredAfter: new Date(now.getTime() - REVIEW_REQUEST_UNTIL_MS), deliveredBefore: new Date(now.getTime() - REVIEW_REQUEST_AFTER_MS) }
}
