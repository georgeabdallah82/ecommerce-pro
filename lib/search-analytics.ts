import { db } from '@/lib/prisma'
import { runInBackground } from '@/lib/background'

// What shoppers search for on the shop (Admin > Analytics > Searches). One row per search the
// shopper runs on the first page of results. Kept for 90 days (pruned by the daily job).

const MAX_QUERY = 80
const DAY_MS = 24 * 60 * 60 * 1000
export const SEARCH_REPORT_DAYS = 30

// The text as it is grouped in the report: lower case, single spaces, short.
export function cleanSearchText(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
}

// Written after the response has gone out, so the shop page never waits on it.
export function recordSearch(raw: string, results: number) {
  const query = cleanSearchText(raw)
  if (query.length < 2) return
  runInBackground(
    db.searchQuery.create({ data: { query, results: Math.max(0, Math.trunc(results)) } })
      .catch(error => console.error('[search] could not record', error)),
  )
}

export async function searchReport(now = new Date()) {
  const since = new Date(now.getTime() - SEARCH_REPORT_DAYS * DAY_MS)
  const [total, top, empty] = await Promise.all([
    db.searchQuery.count({ where: { createdAt: { gte: since } } }),
    db.searchQuery.groupBy({ by: ['query'], where: { createdAt: { gte: since } }, _count: { query: true }, _avg: { results: true }, orderBy: { _count: { query: 'desc' } }, take: 25 }),
    db.searchQuery.groupBy({ by: ['query'], where: { createdAt: { gte: since }, results: 0 }, _count: { query: true }, orderBy: { _count: { query: 'desc' } }, take: 25 }),
  ])
  const noResults = await db.searchQuery.count({ where: { createdAt: { gte: since }, results: 0 } })
  return {
    days: SEARCH_REPORT_DAYS,
    total,
    noResults,
    top: top.map(row => ({ query: row.query, searches: row._count.query, avgResults: Math.round((row._avg.results || 0) * 10) / 10 })),
    empty: empty.map(row => ({ query: row.query, searches: row._count.query })),
  }
}

// Old searches are deleted (run by the daily job).
export async function pruneSearchData(now = new Date()) {
  const { count } = await db.searchQuery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } } })
  return count
}
