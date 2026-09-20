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
