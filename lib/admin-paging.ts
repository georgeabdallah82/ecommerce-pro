// Paging for the admin list endpoints. Each one answers { rows, total, skip, take }, so a screen
// can show a "Load more" control instead of downloading the whole table.

// Reads ?skip and ?take. A missing or empty value takes the default (clampInt would read a
// missing value as 0 and so give take = 1). A non-numeric value takes the default too. take stays
// between 1 and maxTake, and skip is never negative.
export function readPaging(searchParams: URLSearchParams, defaultTake: number, maxTake: number) {
  return {
    skip: pagingNumber(searchParams.get('skip'), 0, 100_000, 0),
    take: pagingNumber(searchParams.get('take'), 1, maxTake, defaultTake),
  }
}

function pagingNumber(raw: string | null, min: number, max: number, fallback: number) {
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export function pagedReply<T>(rows: T[], total: number, skip: number, take: number) {
  return { rows, total, skip, take }
}
