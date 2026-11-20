import { failedCheck, verifyAlertToken } from '@/lib/github-check-alerts'
import { alertJobFailure } from '@/lib/order-alerts'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'no-store' }

// A GitHub check failed (.github/workflows/check-alerts.yml sends the failed run, with its GitHub OIDC token). The
// owner is told like for a failing store job (lib/order-alerts.ts), once per run however often it is sent.
export async function POST(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !(await verifyAlertToken(token))) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const run = failedCheck(await req.json().catch(() => null))
  if (!run) return json({ error: 'Unknown check' }, { status: 400, headers: NO_STORE })
  const once = await consumeDurableRateLimit(`github-check-run:${run.runKey}`, 1, 24 * 60 * 60 * 1000)
  if (!once.allowed) return json({ ok: true, alerted: false }, { headers: NO_STORE })
  const alerted = await alertJobFailure(`github:${run.file}`, 0, `See the run: ${run.runUrl}`, { name: run.name, body: run.body })
  return json({ ok: true, alerted }, { headers: NO_STORE })
}
