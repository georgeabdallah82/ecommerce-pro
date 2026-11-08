import { requirePermission } from '@/lib/auth'
import { openShift } from '@/lib/pos-shifts'
import { tillFailure } from '@/lib/pos-http'
import { json } from '@/lib/utils'

// Open a shift on a register with the opening cash.
export async function POST(req: Request) {
  let actor
  try {
    actor = await requirePermission('orders.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  let body: { registerId?: unknown; openingCashCents?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request could not be read. Try again.' }, { status: 400 })
  }
  try {
    const shift = await openShift({ registerId: body.registerId, openingCashCents: body.openingCashCents }, actor.id)
    return json({ shiftId: shift.id }, { status: 201 })
  } catch (error) {
    return tillFailure(error, 'shift')
  }
}
