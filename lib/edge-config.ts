import { getCloudflareContext } from '@opennextjs/cloudflare'
import { loadEdgeConfigRows } from '@/lib/edge-db'

// What proxy.ts must know before every request -- is the store in maintenance mode, and does this address redirect --
// kept as a small copy in the media bucket (R2), so answering a request costs no database time. Every request used to
// ask the database both questions, so the Neon database (free plan: 100 hours a month) never got to sleep: robots
// and scanners visiting the closed store around the clock used most of the month's hours.
//
// The copy is rebuilt from the database when it is missing or older than 6 hours, and cleared by the saves that change
// it: Settings (the maintenance switch), Redirects, and a product's or collection's new address. Each Worker also keeps
// it in memory for a minute. Without a bucket (local development, CI), or when anything here fails, proxy.ts asks the
// database as before. A change made straight in the database (not through the admin) shows within 6 hours.
export const EDGE_CONFIG_KEY = 'ops/edge-config.json'
// The maintenance page's own copy (lib/maintenance-page-data.ts): its texts, the brand and the contact details.
export const MAINTENANCE_PAGE_KEY = 'ops/maintenance-page.json'
export const EDGE_COPY_MAX_AGE_MS = 6 * 60 * 60_000
// Set by proxy.ts on the request it sends to the maintenance page: the store is closed for this request.
export const MAINTENANCE_GATE_HEADER = 'x-maintenance-gate'
const MEMORY_MS = 60_000

export type EdgeConfig = { v: 1; at: number; maintenance: boolean; redirects: Record<string, [string, string]>; partial: boolean }

// A copy as stored: anything unreadable, from the future or older than 6 hours counts as none.
export function parseEdgeConfig(raw: unknown, now: number): EdgeConfig | null {
  let value: any = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || value.v !== 1 || typeof value.maintenance !== 'boolean' || !value.redirects || typeof value.redirects !== 'object' || Array.isArray(value.redirects)) return null
  const at = Number(value.at)
  if (!Number.isFinite(at) || at > now + 60_000 || now - at > EDGE_COPY_MAX_AGE_MS) return null
  return { v: 1, at, maintenance: value.maintenance, redirects: value.redirects, partial: value.partial === true }
}

// The redirect for an address: found, none (null), or unknown (undefined) when the copy was cut short (very many
// redirects), in which case proxy.ts asks the database for this one address.
export function redirectFor(config: EdgeConfig, path: string): { id: string; toPath: string } | null | undefined {
  const hit = Object.prototype.hasOwnProperty.call(config.redirects, path) ? config.redirects[path] : null
  if (Array.isArray(hit) && typeof hit[0] === 'string' && typeof hit[1] === 'string') return { id: hit[0], toPath: hit[1] }
  return config.partial ? undefined : null
}

async function bucket(): Promise<any | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as any)?.MEDIA_BUCKET || null
  } catch {
    return null
  }
}

let memory: { config: EdgeConfig; until: number } | null = null

export async function readEdgeConfig(now = Date.now()): Promise<EdgeConfig | null> {
  if (memory && memory.until > now) return memory.config
  try {
    const store = await bucket()
    if (!store) return null
    const object = await store.get(EDGE_CONFIG_KEY)
    let config = object ? parseEdgeConfig(await object.text(), now) : null
    if (!config) {
      const rows = await loadEdgeConfigRows()
      if (!rows) return null
      config = { v: 1, at: now, ...rows }
      await store.put(EDGE_CONFIG_KEY, JSON.stringify(config), { httpMetadata: { contentType: 'application/json' } })
    }
    memory = { config, until: now + MEMORY_MS }
    return config
  } catch (error) {
    console.error('[edge-config] copy unavailable, asking the database', error instanceof Error ? error.message : error)
    return null
  }
}

async function deleteCopies(keys: string[]) {
  const store = await bucket()
  if (store) await store.delete(keys)
}

// After a save that changes what the copies hold: the next request rebuilds them from the database. A request that
// read the database just before the save could still write its (old) copy just after it, so the copies are cleared
// again a few seconds later, after the response (`later` hands that to the platform's waitUntil).
export async function clearEdgeCopies(which: 'all' | 'config' | 'page' = 'all', later?: (task: Promise<unknown>) => void) {
  const keys = which === 'config' ? [EDGE_CONFIG_KEY] : which === 'page' ? [MAINTENANCE_PAGE_KEY] : [EDGE_CONFIG_KEY, MAINTENANCE_PAGE_KEY]
  if (which !== 'page') memory = null
  const clear = () => deleteCopies(keys).catch(error => console.error('[edge-config] could not clear the copies', error))
  await clear()
  later?.(new Promise(resolve => setTimeout(resolve, 5000)).then(clear))
}
