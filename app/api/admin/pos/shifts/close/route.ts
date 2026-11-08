import { requirePermission } from '@/lib/auth'
import { closeShift } from '@/lib/pos-shifts'
import { tillFailure } from '@/lib/pos-http'
import { json } from '@/lib/utils'

// Close the cashier's shift against the counted cash.
export async function POST(req: Request) {
  let actor
  try {
    actor = await requirePermission('orders.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  let body: { countedCashCents?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request could not be read. Try again.' }, { status: 400 })
  }
  try {
    return json(await closeShift({ countedCashCents: body.countedCashCents, note: body.note }, actor.id))
  } catch (error) {
    return tillFailure(error, 'shift')
  }
}
