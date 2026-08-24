import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { runPlatformHealth } from '@/lib/platform-health'

export async function GET() {
  try {
    await requirePermission('settings.view')
    const health = await runPlatformHealth()
    return json(health, { status: health.status === 'critical' ? 503 : 200 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to read platform health' }, { status: 403 })
  }
}
