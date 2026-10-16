import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { driverForToken, markDeliveredByDriver, reportDeliveryProblem } from '@/lib/drivers'
import { PROBLEM_REASONS, type ProblemReason } from '@/lib/drivers-shared'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// A driver's own page (app/driver/[token]): "Delivered" and "Couldn't deliver". The link's code
// is the driver's key; only orders given to that driver can be changed.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limit = await consumeDurableRateLimit(`driver:${clientIp(req.headers)}`, 120, 60 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many taps. Please wait a minute.' }, { status: 429, headers: NO_STORE })
  const driver = await driverForToken((await params).token)
  if (!driver) return json({ error: 'This link no longer works. Ask the store for your new link.' }, { status: 403, headers: NO_STORE })
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const orderId = String(body?.orderId || '').slice(0, 64)
  if (!orderId) return json({ error: 'Choose an order' }, { status: 400, headers: NO_STORE })
  try {
    if (body?.action === 'delivered') {
      const result = await markDeliveredByDriver(driver, orderId)
      return json({ ok: true, cash: result.cash, already: result.already }, { headers: NO_STORE })
    }
    if (body?.action === 'problem') {
      const reason = PROBLEM_REASONS.some(r => r.value === body.reason) ? body.reason as ProblemReason : 'other'
      const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 300)
      await reportDeliveryProblem(driver, orderId, reason, note)
      return json({ ok: true }, { headers: NO_STORE })
    }
    return json({ error: 'Unknown action' }, { status: 400, headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/not on your list|not out for delivery/.test(message)) return json({ error: message }, { status: 409, headers: NO_STORE })
    console.error('[driver] action failed', error)
    return json({ error: 'Something went wrong. Try again, or call the store.' }, { status: 500, headers: NO_STORE })
  }
}
