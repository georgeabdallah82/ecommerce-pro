import { routeError } from '@/lib/api-error'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { blockPhone, getBlockedPhones, unblockPhone } from '@/lib/blocked-phones'

export async function GET() {
  try {
    await requirePermission('orders.view')
    return json({ blocked: await getBlockedPhones() })
  } catch (e) { return routeError(e, 'Forbidden', 403) }
}

// {phone, note?} blocks a number; {phone, unblock: true} lets it order again.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const b = await req.json().catch(() => ({}))
    const phone = String(b.phone || '').trim().slice(0, 40)
    if (!phone) return json({ error: 'Phone number required' }, { status: 400 })
    const result = b.unblock ? await unblockPhone(phone) : await blockPhone(phone, b.note ? String(b.note) : undefined)
    await audit(actor.id, b.unblock ? 'customer.unblocked' : 'customer.blocked', 'Setting', undefined, { phone: result.phone })
    return json({ phone: result.phone, blocked: result.list })
  } catch (e) { return routeError(e, 'Unable to update blocked numbers', 400) }
}
