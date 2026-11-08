import { requirePermission } from '@/lib/auth'
import { TransactionUnavailableError } from '@/lib/prisma'
import { SaleError, recordPosSale } from '@/lib/pos-sale'
import { json } from '@/lib/utils'

// The till records a sale here. Staff only, and the server checks every price, quantity and payment.
export async function POST(req: Request) {
  let actor
  try {
    actor = await requirePermission('orders.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The sale could not be read. Try again.' }, { status: 400 })
  }

  try {
    const result = await recordPosSale(body, actor.id)
    return json(result, { status: result.replayed ? 200 : 201 })
  } catch (error) {
    if (error instanceof SaleError) return json({ error: error.message }, { status: 400 })
    if (error instanceof TransactionUnavailableError) return json({ error: error.message }, { status: 503 })
    console.error('[pos] sale failed', error)
    return json({ error: 'The sale could not be saved. Nothing was charged. Please try again.' }, { status: 500 })
  }
}
