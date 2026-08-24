import { requirePermission } from '@/lib/auth'
import { runPlatformHealth } from '@/lib/platform-health'
import SystemHealthAdmin from '@/components/system-health-admin'

export default async function SystemHealth() {
  await requirePermission('settings.view')
  return <SystemHealthAdmin initial={await runPlatformHealth()} />
}
