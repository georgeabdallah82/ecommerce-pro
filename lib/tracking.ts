import { db } from '@/lib/prisma'

export type TrackingConfig = {
  metaPixelId: string
  gaMeasurementId: string
  tiktokPixelId: string
}

const TRACKING_KEYS = ['tracking.metaPixelId', 'tracking.gaMeasurementId', 'tracking.tiktokPixelId'] as const

export async function getTrackingConfig(): Promise<TrackingConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: [...TRACKING_KEYS] } } })
  const map = new Map(rows.map((r: { key: string; value: string }) => [r.key, r.value]))
  return {
    metaPixelId: (map.get('tracking.metaPixelId') || '').trim(),
    gaMeasurementId: (map.get('tracking.gaMeasurementId') || '').trim(),
    tiktokPixelId: (map.get('tracking.tiktokPixelId') || '').trim(),
  }
}
