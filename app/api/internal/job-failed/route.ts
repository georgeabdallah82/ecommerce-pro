import { isInternalJobRequest } from '@/lib/internal-job'
import { SCHEDULED_JOBS, alertJobFailure } from '@/lib/order-alerts'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'no-store' }

// A scheduled job answered with an error (worker.ts scheduled()). It goes in the activity log, and the owner is
// told at most once per job every 6 hours (lib/order-alerts.ts). Only the Worker's own key or the CRON_SECRET
// bearer is accepted, and only for the store's own jobs.
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const path = typeof body.path === 'string' && Object.prototype.hasOwnProperty.call(SCHEDULED_JOBS, body.path) ? body.path : ''
  if (!path) return json({ error: 'Unknown job' }, { status: 400, headers: NO_STORE })
  const status = Number.isInteger(body.status) ? Number(body.status) : 0
  const detail = typeof body.detail === 'string' ? body.detail.slice(0, 300) : ''
  const alerted = await alertJobFailure(path, status, detail)
  return json({ ok: true, alerted }, { headers: NO_STORE })
}
