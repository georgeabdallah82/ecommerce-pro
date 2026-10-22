import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { getQuantityDeals, saveQuantityDeals } from '@/lib/quantity-deals'
import { dealsProblem, normalizeQuantityDeals } from '@/lib/quantity-deals-shared'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
    await requirePermission('coupons.view')
    return json(await getQuantityDeals(), { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to load the quantity deals', 400)
  }
}

// Saves the switch and the whole list of deals (the admin page edits them together).
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    const config = normalizeQuantityDeals(body)
    const problem = dealsProblem(config)
    if (problem) return json({ error: problem }, { status: 400, headers: NO_STORE })
    await saveQuantityDeals(config)
    await audit(actor.id, 'quantity_deals.updated', 'Setting', 'quantityDeals.config', { enabled: config.enabled, deals: config.deals.length })
    return json(config, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to save the quantity deals', 400)
  }
}
