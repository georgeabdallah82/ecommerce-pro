import { requirePermission } from '@/lib/auth'
import { recordCashMovement } from '@/lib/pos-shifts'
import { tillFailure } from '@/lib/pos-http'
import { json } from '@/lib/utils'

// Cash put into or taken out of the drawer during the cashier's shift.
export async function POST(req: Request) {
  let actor
  try {
    actor = await requirePermission('orders.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  let body: { kind?: unknown; amountCents?: unknown; reason?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request could not be read. Try again.' }, { status: 400 })
  }
  try {
    const movement = await recordCashMovement({ kind: body.kind, amountCents: body.amountCents, reason: body.reason }, actor.id)
    return json({ id: movement.id }, { status: 201 })
  } catch (error) {
    return tillFailure(error, 'cash movement')
  }
}
