// Order-day alerts, the rules that need no database (shared by the checkout, the 15-minute check in
// worker.ts, app/api/internal/order-watch, the settings and the tests).
//
// 1. "Checkout failed": a customer's order hit an unexpected error. The owner hears at once
//    (throttled), without personal details.
// 2. "Order waiting": a new order was not confirmed for N minutes (Settings > Notifications).
//
// Nothing polls the database. A tiny marker file in the media bucket (OrderWatch) says "an order is
// waiting to be watched": checkout writes it when an order arrives, the 15-minute check reads only
// that file, and only when it says so (and it is not night) does it ask the database. With no new
// orders the check never wakes the database, so it costs none of the monthly database hours.

export const ORDER_WATCH_KEY = 'ops/order-watch.json'
export const ORDER_WATCH_CRON = '*/15 * * * *'
export const ORDER_PROBLEMS_SETTING = 'notifications.orderProblems'
export const WAIT_MINUTES_SETTING = 'notifications.stuckOrderMinutes'
export const DEFAULT_WAIT_MINUTES = 60
export const MIN_WAIT_MINUTES = 10
export const MAX_WAIT_MINUTES = 720
// No reminders at night (store time): they wait for the morning.
export const QUIET_FROM_HOUR = 23
export const QUIET_UNTIL_HOUR = 8
export const MAX_ALERTED = 200
// At most one "checkout failed" alert per this long (the first one tells the owner; more of the same
// failure in the next minutes add nothing).
export const CHECKOUT_ALERT_WINDOW_MS = 20 * 60_000

export type OrderWatch = { armed: boolean; since: number; tz: string; alerted: string[] }

const ID = /^[A-Za-z0-9_-]{1,64}$/

// The marker as stored; anything unreadable counts as "nothing to watch".
export function parseWatch(raw: unknown): OrderWatch | null {
  let value: any = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || typeof value !== 'object') return null
  const since = Number(value.since)
  if (!Number.isFinite(since) || since <= 0) return null
  const alerted = Array.isArray(value.alerted) ? value.alerted.filter((x: unknown): x is string => typeof x === 'string' && ID.test(x)).slice(-MAX_ALERTED) : []
  return { armed: value.armed === true, since, tz: typeof value.tz === 'string' && value.tz.trim() ? value.tz.trim().slice(0, 64) : 'UTC', alerted }
}

// Minutes the owner chose: empty = the default, 0 = off, otherwise kept within sensible limits.
export function waitMinutes(setting: string | null | undefined): number {
  const text = String(setting ?? '').trim()
  if (!text) return DEFAULT_WAIT_MINUTES
  const n = Math.floor(Number(text))
  if (!Number.isFinite(n)) return DEFAULT_WAIT_MINUTES
  if (n <= 0) return 0
  return Math.min(MAX_WAIT_MINUTES, Math.max(MIN_WAIT_MINUTES, n))
}

export function storeHour(date: Date, timezone: string): number {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(date))
    if (Number.isFinite(hour)) return hour
  } catch {}
  return date.getUTCHours()
}

export function inQuietHours(date: Date, timezone: string): boolean {
  const hour = storeHour(date, timezone)
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR
}

export type WaitingOrder = { id: string; orderNumber?: string; createdAt: Date | string | number; grandTotal?: number; currency?: string }

const at = (o: WaitingOrder) => new Date(o.createdAt).getTime()

// Orders that have waited long enough and the owner has not been told about yet.
export function dueOrders<T extends WaitingOrder>(pending: T[], now: Date, minutes: number, alerted: string[]): T[] {
  if (minutes <= 0) return []
  const told = new Set(alerted)
  return pending.filter(o => !told.has(o.id) && now.getTime() - at(o) >= minutes * 60_000)
}

// What the marker should say after a check: the orders told about (only those still waiting, so the
// list never grows), and "armed" only while some waiting order has not yet reached its time.
export function nextWatch(prev: OrderWatch, pending: WaitingOrder[], newlyAlerted: string[], minutes: number, now: Date): OrderWatch {
  const stillPending = new Set(pending.map(o => o.id))
  const alerted = [...new Set([...prev.alerted, ...newlyAlerted])].filter(id => stillPending.has(id)).slice(-MAX_ALERTED)
  const told = new Set(alerted)
  void now
  const armed = minutes > 0 && pending.some(o => !told.has(o.id))
  return { ...prev, armed, alerted }
}

// "Order 1042 has waited 1 h 10 min" in a push (title + body) and an email subject.
export function waitedText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

export function waitingMessage(orders: WaitingOrder[], now: Date) {
  const list = [...orders].sort((a, b) => at(a) - at(b))
  const label = (o: WaitingOrder) => `#${o.orderNumber || o.id}`
  const oldest = list[0]
  const minutes = oldest ? (now.getTime() - at(oldest)) / 60_000 : 0
  if (list.length === 1) return { title: 'An order is waiting for you', body: `${label(oldest)} has waited ${waitedText(minutes)} without being confirmed.` }
  const names = list.slice(0, 4).map(label).join(', ')
  return { title: `${list.length} orders are waiting for you`, body: `${names}${list.length > 4 ? ` and ${list.length - 4} more` : ''} have not been confirmed. The oldest waited ${waitedText(minutes)}.` }
}

export type CheckoutFailureKind = 'database' | 'payment' | 'other'

// Plain reason for the owner; never the raw error (it can carry customer details).
export function checkoutFailureKind(error: unknown): CheckoutFailureKind {
  const code = String((error as any)?.code || '')
  const name = String((error as any)?.name || '')
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/^P(1\d{3}|2024|2028)$/.test(code) || /PrismaClient(Initialization|RustPanic)|ECONNREFUSED|ETIMEDOUT|connection|timed out|too many connections/i.test(`${name} ${message}`)) return 'database'
  if (/payment|gateway|card|areeba|stripe|provider/i.test(message)) return 'payment'
  return 'other'
}

export function checkoutAlertText(kind: CheckoutFailureKind) {
  const why = kind === 'database' ? 'The store could not reach its database.' : kind === 'payment' ? 'The card payment service did not answer properly.' : 'Something unexpected went wrong while saving the order.'
  return {
    title: 'A customer could not place an order',
    body: `${why} Open the store and try an order yourself. If it still fails, tell your developer.`,
    subject: 'A customer could not place an order',
  }
}
