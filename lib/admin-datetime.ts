// Settings > Store > Timezone (store.timezone) saved fine but nothing ever read it back --
// admin order/audit timestamps were always rendered in whichever browser happened to view
// them, not the store's own timezone. This is the client-safe formatting half (no server
// imports, usable from client components); lib/store-timezone.ts fetches the setting itself.
export const DEFAULT_STORE_TIMEZONE = 'Asia/Beirut'

export function formatAdminDateTime(value: string | Date | null | undefined, timezone?: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const opts = options || { dateStyle: 'medium', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone || DEFAULT_STORE_TIMEZONE, ...opts }).format(date)
  } catch {
    // An invalid/unrecognized IANA timezone string (e.g. a typo saved through the settings
    // form) must not break every order/audit page in the admin -- fall back to the browser's
    // own formatting rather than throwing.
    return date.toLocaleString()
  }
}

export function formatAdminDate(value: string | Date | null | undefined, timezone?: string | null): string {
  return formatAdminDateTime(value, timezone, { dateStyle: 'medium' })
}

// The calendar day (YYYY-MM-DD) an instant falls on in the store's timezone.
export function zonedDayKey(value: string | Date | null | undefined, timezone?: string | null): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || DEFAULT_STORE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
    const get = (type: string) => parts.find(p => p.type === type)?.value || ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

// Adds days to a YYYY-MM-DD calendar day (negative to go back).
export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// The instant local midnight of a YYYY-MM-DD day happens in the store's timezone (DST-aware).
export function zonedMidnight(ymd: string, timezone?: string | null): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const zone = timezone || DEFAULT_STORE_TIMEZONE
  const offsetAt = (instant: number) => {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]))
    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - instant
  }
  const guess = Date.UTC(y, m - 1, d)
  const first = guess - offsetAt(guess)
  return new Date(guess - offsetAt(first))
}
