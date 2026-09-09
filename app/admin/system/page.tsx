import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { runPlatformHealth } from '@/lib/platform-health'
import SystemHealthAdmin from '@/components/system-health-admin'

export default async function SystemHealth() {
  const user = await requirePermission('settings.view')
  const canRepair = hasPermission(user.role, 'settings.manage')
  return <SystemHealthAdmin initial={await runPlatformHealth()} canRepair={canRepair} />
}
