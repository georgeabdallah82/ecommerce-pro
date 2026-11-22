import { isInternalJobRequest } from '@/lib/internal-job'
import { alertServerErrors } from '@/lib/order-alerts'
import { parseServerErrors, serverErrorSummary } from '@/lib/server-errors'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'no-store' }

// The store answered with server errors (worker.ts counts them, lib/server-errors.ts). Only the Worker's own key
// or the CRON_SECRET bearer is accepted. The owner is told like for a failing job (lib/order-alerts.ts).
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const body = (await req.json().catch(() => null)) as { state?: unknown } | null
  const state = parseServerErrors(JSON.stringify(body?.state ?? null))
  if (!state || state.count < 1) return json({ error: 'No errors reported' }, { status: 400, headers: NO_STORE })
  const alerted = await alertServerErrors(serverErrorSummary(state), state.count)
  return json({ ok: true, alerted }, { headers: NO_STORE })
}
