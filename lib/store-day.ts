// "Today" in the store's own timezone (Settings > General), not the server's.

function parts(date: Date, timezone: string) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  const out: Record<string, number> = {}
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

function asUtc(date: Date, timezone: string) {
  const p = parts(date, timezone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

// The moment today began in that timezone (midnight there). An unknown timezone counts as UTC.
export function startOfStoreDay(now: Date, timezone: string): Date {
  try {
    const p = parts(now, timezone)
    const midnightAsIfUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0)
    // The offset can change during the day (summer time), so it is measured at the answer itself.
    let start = midnightAsIfUtc - (asUtc(now, timezone) - now.getTime())
    start = midnightAsIfUtc - (asUtc(new Date(start), timezone) - start)
    return new Date(start)
  } catch {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }
}

// 0-23: the hour of day in the store's timezone.
export function storeHourOf(date: Date, timezone: string): number {
  try { return parts(date, timezone).hour } catch { return date.getUTCHours() }
}
