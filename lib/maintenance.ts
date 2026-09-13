import { db } from '@/lib/prisma'

export type MaintenanceConfig = {
  enabled: boolean
  launchAt: string
  headline: string
  message: string
}

const MAINTENANCE_KEYS = ['maintenance.enabled', 'maintenance.launchAt', 'maintenance.headline', 'maintenance.message'] as const

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: [...MAINTENANCE_KEYS] } } })
  const map = new Map(rows.map((r: { key: string; value: string }) => [r.key, r.value]))
  return {
    enabled: map.get('maintenance.enabled') === 'true',
    launchAt: map.get('maintenance.launchAt') || '',
    headline: map.get('maintenance.headline') || "We're launching soon",
    message: map.get('maintenance.message') || "We're putting the finishing touches on something great. Check back soon.",
  }
}
