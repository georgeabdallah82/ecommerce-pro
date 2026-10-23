import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { saveDeliverySlots } from '@/lib/delivery-slots-server'
import { validateSlots } from '@/lib/delivery-slots'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Admin > Shipping > Delivery times customers can choose: switch it on and write the times.
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('shipping.manage')
    const checked = validateSlots(await req.json().catch(() => ({})))
    if (!checked.ok) return json({ error: checked.error }, { status: 400, headers: NO_STORE })
    await saveDeliverySlots(checked.value)
    await audit(actor.id, 'delivery_slots.updated', 'Setting', 'delivery.slots', { enabled: checked.value.enabled, count: checked.value.slots.length })
    return json({ ok: true, config: checked.value }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to save the delivery times', 400)
  }
}
