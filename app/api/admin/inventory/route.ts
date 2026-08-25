import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, clampInt } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('inventory.view')
    return json(await db.inventoryItem.findMany({ include: { product: true, variant: true, movements: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { quantity: 'asc' } }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('inventory.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Inventory item id is required' }, { status: 400 })
    const delta = clampInt(b.delta, -100000, 100000, 0)
    const reason = String(b.reason || 'Manual adjustment').trim().slice(0, 1000) || 'Manual adjustment'
    const movementType = String(b.movementType || '').toUpperCase() === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT'
    const requestedLocation = b.location !== undefined ? String(b.location || '').trim().slice(0, 120) || 'Main' : undefined

    const updated = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${id} FOR UPDATE`
      const item = await tx.inventoryItem.findUnique({ where: { id } })
      if (!item) throw new Error('Inventory item not found')
      const next = item.quantity + delta
      if (next < item.reserved) throw new Error('Cannot reduce stock below reserved quantity')

      if (requestedLocation !== undefined && requestedLocation !== (item.location || 'Main')) {
        const collision = await tx.inventoryItem.findFirst({
          where: {
            id: { not: id },
            productId: item.productId,
            variantId: item.variantId,
            location: requestedLocation,
          },
          select: { id: true },
        })
        if (collision) throw new Error('That product/variant already has inventory at the selected location. Adjust the existing location record instead.')
      }

      const row = await tx.inventoryItem.update({
        where: { id },
        data: {
          quantity: next,
          lowStockThreshold: b.lowStockThreshold !== undefined ? clampInt(b.lowStockThreshold, 0, 100000, item.lowStockThreshold) : undefined,
          location: requestedLocation,
        },
        include: { movements: { orderBy: { createdAt: 'desc' }, take: 10 } },
      })
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: id,
            type: movementType,
            quantity: delta,
            reason,
          },
        })
      }
      return row
    })

    await audit(actor.id, 'inventory.adjusted', 'InventoryItem', id, { delta, reason, movementType, location: requestedLocation, lowStockThreshold: b.lowStockThreshold })
    return json({ item: updated })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to adjust inventory' }, { status: 400 })
  }
}
