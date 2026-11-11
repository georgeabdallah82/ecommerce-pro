import { json } from '@/lib/utils'
import { UserError } from '@/lib/user-error'

// The most rows one admin list returns. The pages read these replies as plain arrays, so a list
// over the cap is cut to the cap and the reply says so in the X-Truncated header; the body keeps
// its shape. The caps sit well above what a store has in these lists: they bound the worst case.
export const LIST_CAP = 500

// Reports read every row of a period, so a cut would give wrong totals. A period over its cap is
// refused with a message that says what to change instead.
export const REPORT_ORDER_CAP = 20000
export const REPORT_CUSTOMER_CAP = 50000
export const REPORT_INVENTORY_CAP = 50000

// Routes fetch `cap + 1` rows so this can tell the list was longer, then keep `cap` of them.
export function capRows<T>(rows: T[], cap: number) {
  const truncated = rows.length > cap
  return { rows: truncated ? rows.slice(0, cap) : rows, truncated }
}

export function cappedJson<T>(rows: T[], cap: number, init?: ResponseInit) {
  const capped = capRows(rows, cap)
  return json(capped.rows, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), 'X-Truncated': String(capped.truncated) } })
}

export function reportRows<T>(rows: T[], cap: number, message: string): T[] {
  if (rows.length > cap) throw new UserError(message, 413, 'REPORT_TOO_LARGE')
  return rows
}
