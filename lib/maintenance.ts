import { db } from '@/lib/prisma'
import { MAINTENANCE_MODE_INFO, maintenanceMode, maintenanceText, type MaintenanceMode } from '@/lib/maintenance-defaults'

// Maintenance mode (Settings > Maintenance): while it's on, customers see the maintenance page
// (app/maintenance/route.ts) instead of the store; signed-in staff keep seeing the store.
export type MaintenanceConfig = {
  enabled: boolean
  mode: MaintenanceMode
  headline: string
  message: string
  backBy: string // optional note, e.g. "Back by 6 pm" or "Opening 1 December"
}

const MAINTENANCE_KEYS = ['maintenance.enabled', 'maintenance.mode', 'maintenance.headline', 'maintenance.message', 'maintenance.backBy'] as const

export function maintenanceFromSettings(values: Record<string, string | undefined>): MaintenanceConfig {
  const mode = maintenanceMode(values['maintenance.mode'])
  const defaults = MAINTENANCE_MODE_INFO[mode]
  return {
    enabled: values['maintenance.enabled'] === 'true',
    mode,
    headline: maintenanceText(values['maintenance.headline'], defaults.headline),
    message: maintenanceText(values['maintenance.message'], defaults.message),
    backBy: String(values['maintenance.backBy'] || '').trim(),
  }
}

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: [...MAINTENANCE_KEYS] } }, select: { key: true, value: true } })
  return maintenanceFromSettings(Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value])))
}
