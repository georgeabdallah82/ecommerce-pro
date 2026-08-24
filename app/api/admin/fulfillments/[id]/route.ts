import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const b = await req.json()
    const existing = await db.fulfillment.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Fulfillment not found' }, { status: 404 })
    const status = b.status ? String(b.status) : undefined
    const updated = await db.fulfillment.update({ where: { id }, data: {
      ...(status ? { status } : {}),
      ...(b.trackingNumber !== undefined ? { trackingNumber: b.trackingNumber ? String(b.trackingNumber) : null } : {}),
      ...(b.trackingCompany !== undefined ? { trackingCompany: b.trackingCompany ? String(b.trackingCompany) : null } : {}),
      ...(b.trackingUrl !== undefined ? { trackingUrl: b.trackingUrl ? String(b.trackingUrl) : null } : {}),
      ...(status === 'SHIPPED' && !existing.shippedAt ? { shippedAt: new Date() } : {}),
      ...(status === 'DELIVERED' && !existing.deliveredAt ? { deliveredAt: new Date() } : {}),
    }, include: { lines: true } })
    await audit(actor.id, 'fulfillment.updated', 'Fulfillment', id, { fields: Object.keys(b), status })
    return json({ fulfillment: updated })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update fulfillment' }, { status: 400 }) }
}
