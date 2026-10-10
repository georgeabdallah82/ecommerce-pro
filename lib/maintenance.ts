import { db } from '@/lib/prisma'
import { MAINTENANCE_DEFAULTS, maintenanceText } from '@/lib/maintenance-defaults'

// Maintenance mode (Settings > Maintenance): while it's on, customers see the maintenance page
// (app/maintenance/route.ts) instead of the store; signed-in staff keep seeing the store.
export type MaintenanceConfig = {
  enabled: boolean
  headline: string
  message: string
  backBy: string // optional "expected back" note, e.g. "Back by 6 pm"
}

const MAINTENANCE_KEYS = ['maintenance.enabled', 'maintenance.headline', 'maintenance.message', 'maintenance.backBy'] as const

export function maintenanceFromSettings(values: Record<string, string | undefined>): MaintenanceConfig {
  return {
    enabled: values['maintenance.enabled'] === 'true',
    headline: maintenanceText(values['maintenance.headline'], MAINTENANCE_DEFAULTS.headline),
    message: maintenanceText(values['maintenance.message'], MAINTENANCE_DEFAULTS.message),
    backBy: String(values['maintenance.backBy'] || '').trim(),
  }
}

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: [...MAINTENANCE_KEYS] } }, select: { key: true, value: true } })
  return maintenanceFromSettings(Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value])))
}
