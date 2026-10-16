import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

// Remove a number from the WhatsApp list (someone asked to stop getting offers).
export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const id = new URL(req.url).searchParams.get('id')?.trim() || ''
    if (!id) return json({ error: 'id is required' }, { status: 400 })
    await db.phoneSubscriber.delete({ where: { id } })
    await audit(actor.id, 'phone_subscriber.removed', 'PhoneSubscriber', id, {})
    return json({ ok: true })
  } catch (e) { return routeError(e, 'Unable to remove this number', 400) }
}
