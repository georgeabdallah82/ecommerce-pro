import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { runPlatformHealth } from '@/lib/platform-health'
import SystemHealthAdmin from '@/components/system-health-admin'
import HealthTabs from '@/components/health-tabs'
import { getStoreTimezone } from '@/lib/store-timezone'

export default async function SystemHealth() {
  const user = await requirePermission('settings.view')
  const canRepair = hasPermission(user, 'settings.manage')
  const [health, storeTimezone] = await Promise.all([runPlatformHealth(), getStoreTimezone()])
  return <><HealthTabs current="system" canManage={canRepair} /><SystemHealthAdmin initial={health} canRepair={canRepair} storeTimezone={storeTimezone} /></>
}
