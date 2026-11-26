import { AsyncLocalStorage } from 'node:async_hooks'
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

// Within one request run through withRequestMemo, each key is read at most once, signed in or not.
// A Worker request may make only 50 outside calls on the Workers Free plan (every Neon query is one),
// and the shopping assistant reads the catalogue, search index and settings from several places in a
// single answer; for a signed-in owner each of those reads went to the database again and the answer
// failed with "Too many subrequests" (docs/ai-assistant-2026-11.md).
const requestMemo = new AsyncLocalStorage<Map<string, Promise<unknown>>>()
export function withRequestMemo<T>(run: () => Promise<T>): Promise<T> {
  return requestMemo.run(new Map(), run)
}

export async function storefrontCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = requestMemo.getStore()
  if (!memo) return readThrough(key, load)
  let pending = memo.get(key) as Promise<T> | undefined
  if (!pending) {
    pending = readThrough(key, load)
    memo.set(key, pending)
    // A failed read is tried again by the next caller rather than failing the rest of the request.
    pending.catch(() => { if (memo.get(key) === pending) memo.delete(key) })
  }
  // A copy for each caller, as the shared cache does, so one caller's changes can't reach another.
  return pending.then(value => structuredClone(value))
}

async function readThrough<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (await bypassCache()) return load()
  return shared.get(key, load)
}

export function storefrontCacheStats() {
  return { entries: shared.size(), ttlMs: TTL_MS }
}
