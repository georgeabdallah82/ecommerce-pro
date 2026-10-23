import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { liveReport, todayReport } from '@/lib/visitor-report'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Admin > Live visitors. ?scope=live is the light, often-refreshed part (who is online now);
// ?scope=today is the day's summary (refreshed less often). Staff with the reports permission only.
export async function GET(req: Request) {
  try {
    await requirePermission('reports.view')
    const scope = new URL(req.url).searchParams.get('scope') === 'today' ? 'today' : 'live'
    return json(scope === 'today' ? await todayReport() : await liveReport(), { headers: NO_STORE })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    console.error('[admin/visitors] failure', error)
    return json({ error: 'Unable to load visitors' }, { status: 500, headers: NO_STORE })
  }
}
