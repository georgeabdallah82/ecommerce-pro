import { getStorefrontSettings } from '@/lib/storefront-settings'

export type TrackingConfig = {
  metaPixelId: string
  gaMeasurementId: string
  tiktokPixelId: string
}

export async function getTrackingConfig(): Promise<TrackingConfig> {
  const map = await getStorefrontSettings()
  return {
    metaPixelId: (map.get('tracking.metaPixelId') || '').trim(),
    gaMeasurementId: (map.get('tracking.gaMeasurementId') || '').trim(),
    tiktokPixelId: (map.get('tracking.tiktokPixelId') || '').trim(),
  }
}
