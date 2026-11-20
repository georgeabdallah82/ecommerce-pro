import { getMediaBucket } from '@/lib/media-storage'
import { getMaintenanceConfig, type MaintenanceConfig } from '@/lib/maintenance'
import { getThemeState } from '@/lib/theme'
import { getContactInfo } from '@/lib/store-contact'
import { EDGE_COPY_MAX_AGE_MS, MAINTENANCE_PAGE_KEY } from '@/lib/edge-config'

// What the maintenance page shows (app/maintenance/route.ts) -- its texts, the brand and the contact details -- kept as
// a copy in the media bucket like the proxy's (lib/edge-config.ts). While the store is closed every visitor, robots
// included, gets this page; it used to read the settings and the theme from the database for each one, which kept the
// database awake. The copy is rebuilt when it is missing or older than 6 hours, and cleared by a Settings save or a
// theme publish. Without a bucket (local development) the page reads the database as before.
export type MaintenancePageData = {
  v: 1
  at: number
  maintenance: MaintenanceConfig | null
  brand: string | null
  logoUrl: string | null
  color: string | null
  phone: string | null
  country: string | null
  email: string | null
}

export function parseMaintenancePageData(raw: unknown, now: number): MaintenancePageData | null {
  let value: any = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || value.v !== 1 || typeof value.maintenance !== 'object') return null
  const at = Number(value.at)
  if (!Number.isFinite(at) || at > now + 60_000 || now - at > EDGE_COPY_MAX_AGE_MS) return null
  return value as MaintenancePageData
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

export async function maintenancePageData(now = Date.now()): Promise<{ data: MaintenancePageData; source: 'copy' | 'database' }> {
  const bucket = await getMediaBucket()
  if (bucket) {
    try {
      const object = await bucket.get(MAINTENANCE_PAGE_KEY)
      const data = object ? parseMaintenancePageData(await object.text(), now) : null
      if (data) return { data, source: 'copy' }
    } catch (error) {
      console.error('[maintenance] copy unavailable, reading the database', error instanceof Error ? error.message : error)
    }
  }
  const [maintenance, themeState, contact] = await Promise.all([
    getMaintenanceConfig().catch(() => null),
    getThemeState().catch(() => null),
    getContactInfo().catch(() => null),
  ])
  const theme: any = themeState?.theme || {}
  const data: MaintenancePageData = {
    v: 1, at: now, maintenance,
    brand: text(theme.brandName), logoUrl: text(theme.logoUrl), color: text(theme.colors?.primary),
    phone: text(contact?.phone), country: text(contact?.country), email: text(contact?.email),
  }
  // Only a complete read is kept: a lookup that failed is not frozen into the copy for hours.
  if (bucket && maintenance && themeState && contact) {
    await bucket.put(MAINTENANCE_PAGE_KEY, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } })
      .catch((error: unknown) => console.error('[maintenance] could not keep the copy', error))
  }
  return { data, source: 'database' }
}
