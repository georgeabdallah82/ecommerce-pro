import { getStorefrontSettings } from '@/lib/storefront-settings'

export type TrackingConfig = {
  metaPixelId: string
  gaMeasurementId: string
  tiktokPixelId: string
  // Google Ads: the account's tag ID (AW-123456789) and the label of the purchase conversion.
  googleAdsId: string
  googleAdsPurchaseLabel: string
}

// The IDs are written into inline <script> tags, so only the ID's own characters are kept;
// anything else (a typo, a quote) would break the pixel or the page. Pasting the platform's whole
// install snippet instead of just the ID also works -- the ID is picked out of it.
export function cleanTrackingIds(raw: { metaPixelId?: string; gaMeasurementId?: string; tiktokPixelId?: string; googleAdsId?: string; googleAdsPurchaseLabel?: string }): TrackingConfig {
  const meta = (raw.metaPixelId || '').trim()
  const ga = (raw.gaMeasurementId || '').trim()
  const tiktok = (raw.tiktokPixelId || '').trim()
  const ads = (raw.googleAdsId || '').trim()
  const label = (raw.googleAdsPurchaseLabel || '').trim()
  return {
    metaPixelId: (meta.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,25})['"]/) || meta.match(/^(\d{6,25})$/) || [])[1] || '',
    gaMeasurementId: ((ga.match(/\b(G-[A-Z0-9]{4,20})\b/i) || [])[1] || '').toUpperCase(),
    tiktokPixelId: ((tiktok.match(/ttq\.load\(\s*['"]([A-Z0-9]{6,40})['"]/i) || tiktok.match(/^([A-Z0-9]{6,40})$/i) || [])[1] || '').toUpperCase(),
    // Accepts the bare ID (AW-123456789), or the 'AW-123456789/label' that Google shows as send_to.
    googleAdsId: ((ads.match(/\b(AW-\d{6,14})\b/i) || [])[1] || '').toUpperCase(),
    googleAdsPurchaseLabel: ((label.match(/^(?:AW-\d{6,14}\/)?([A-Za-z0-9_-]{6,80})$/) || [])[1] || ''),
  }
}

export async function getTrackingConfig(): Promise<TrackingConfig> {
  const map = await getStorefrontSettings()
  return cleanTrackingIds({
    metaPixelId: map.get('tracking.metaPixelId') || '',
    gaMeasurementId: map.get('tracking.gaMeasurementId') || '',
    tiktokPixelId: map.get('tracking.tiktokPixelId') || '',
    googleAdsId: map.get('tracking.googleAdsId') || '',
    googleAdsPurchaseLabel: map.get('tracking.googleAdsPurchaseLabel') || '',
  })
}
