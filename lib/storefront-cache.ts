import { cookies } from 'next/headers'

// Short-lived copies of database results that every shopper sees the same way (store settings
// and theme, hidden-product list, product and collection rows, sales stats), so a rush of
// visitors doesn't send a round of database queries for every page view.
//
// - Kept in the Worker isolate's memory for TTL_MS; a busy isolate asks the database about once
//   per TTL per key instead of once per visit.
// - Only finished results are kept. A database query belongs to the request that started it
//   (lib/prisma.ts closes each request's connections when the request ends), so a query still
//   running is never handed to another request; two misses at the same moment both query.
// - Only for visitors who are not signed in. The owner and staff (and signed-in customers)
//   always read the database directly, so they see their own changes immediately; shoppers see
//   them within TTL_MS.
// - Results are copied on the way in and out (structuredClone), so a page that adds fields to
//   the rows it gets can't change what the next visitor sees.
const TTL_MS = 30_000
const MAX_ENTRIES = 100

// The cache itself, separate from the "who gets it" rule below so it can be tested on its own.
export function createTtlCache(options: { ttlMs: number; maxEntries: number; now?: () => number }) {
  const { ttlMs, maxEntries, now = Date.now } = options
  const entries = new Map<string, { storedAt: number; value: unknown }>()
  return {
    async get<T>(key: string, load: () => Promise<T>): Promise<T> {
      const time = now()
      const hit = entries.get(key)
      if (hit && time - hit.storedAt < ttlMs) return structuredClone(hit.value) as T
      const value = await load()
      try {
        entries.delete(key)
        entries.set(key, { storedAt: time, value: structuredClone(value) })
        if (entries.size > maxEntries) entries.delete(entries.keys().next().value as string)
      } catch {
        // A result that can't be copied (shouldn't happen for database rows) is just not kept.
        entries.delete(key)
      }
      return value
    },
    size: () => entries.size,
  }
}

const shared = createTtlCache({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES })

async function bypassCache(): Promise<boolean> {
  try {
    return Boolean((await cookies()).get('session')?.value)
  } catch {
    // Outside a request (build, scripts): nothing to share between visitors.
    return true
  }
}

export async function storefrontCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (await bypassCache()) return load()
  return shared.get(key, load)
}

export function storefrontCacheStats() {
  return { entries: shared.size(), ttlMs: TTL_MS }
}
