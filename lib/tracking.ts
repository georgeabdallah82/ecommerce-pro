import { getStorefrontSettings } from '@/lib/storefront-settings'

export type TrackingConfig = {
  metaPixelId: string
  gaMeasurementId: string
  tiktokPixelId: string
}

// The IDs are written into inline <script> tags, so only the ID's own characters are kept;
// anything else (a typo, a quote) would break the pixel or the page. Pasting the platform's whole
// install snippet instead of just the ID also works -- the ID is picked out of it.
export function cleanTrackingIds(raw: { metaPixelId?: string; gaMeasurementId?: string; tiktokPixelId?: string }): TrackingConfig {
  const meta = (raw.metaPixelId || '').trim()
  const ga = (raw.gaMeasurementId || '').trim()
  const tiktok = (raw.tiktokPixelId || '').trim()
  return {
    metaPixelId: (meta.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,25})['"]/) || meta.match(/^(\d{6,25})$/) || [])[1] || '',
    gaMeasurementId: ((ga.match(/\b(G-[A-Z0-9]{4,20})\b/i) || [])[1] || '').toUpperCase(),
    tiktokPixelId: ((tiktok.match(/ttq\.load\(\s*['"]([A-Z0-9]{6,40})['"]/i) || tiktok.match(/^([A-Z0-9]{6,40})$/i) || [])[1] || '').toUpperCase(),
  }
}

export async function getTrackingConfig(): Promise<TrackingConfig> {
  const map = await getStorefrontSettings()
  return cleanTrackingIds({
    metaPixelId: map.get('tracking.metaPixelId') || '',
    gaMeasurementId: map.get('tracking.gaMeasurementId') || '',
    tiktokPixelId: map.get('tracking.tiktokPixelId') || '',
  })
}
