import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('inventory.manage')
    const { id } = await params
    const b = await req.json()
    const existing = await db.storeLocation.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Location not found' }, { status: 404 })
    const location = await db.$transaction(async tx => {
      if (b.isDefault === true) await tx.storeLocation.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
      return tx.storeLocation.update({ where: { id }, data: {
        ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
        ...(b.addressJson !== undefined ? { addressJson: b.addressJson ? String(b.addressJson) : null } : {}),
        ...(b.phone !== undefined ? { phone: b.phone ? String(b.phone) : null } : {}),
        ...(b.status !== undefined ? { status: b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' } : {}),
        ...(b.isDefault !== undefined ? { isDefault: Boolean(b.isDefault) } : {}),
      } })
    })
    await audit(actor.id, 'location.updated', 'StoreLocation', id, { fields: Object.keys(b) })
    return json({ location })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update location' }, { status: 400 }) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('inventory.manage')
    const { id } = await params
    const existing = await db.storeLocation.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Location not found' }, { status: 404 })
    const references = await Promise.all([
      db.inventoryTransfer.count({ where: { OR: [{ fromLocationId: id }, { toLocationId: id }] } }),
      db.purchaseOrder.count({ where: { locationId: id } }),
      db.fulfillment.count({ where: { locationId: id } }),
    ])
    if (references.some(Boolean)) return json({ error: 'Location is referenced by inventory operations and cannot be deleted. Disable it instead.' }, { status: 409 })
    await db.storeLocation.delete({ where: { id } })
    await audit(actor.id, 'location.deleted', 'StoreLocation', id, { name: existing.name })
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to delete location' }, { status: 400 }) }
}
