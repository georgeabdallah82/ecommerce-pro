import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, clampInt } from '@/lib/utils'

const HISTORY_LIMIT = 50

export async function GET() {
  try {
    await requirePermission('inventory.view')
    const rows = await db.inventoryItem.findMany({
      include: { product: true, variant: true, movements: { orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT } },
      orderBy: { quantity: 'asc' },
    })
    return json(rows, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    const status = message === 'UNAUTHORIZED' ? 401 : 403
    if (status === 403 && message !== 'FORBIDDEN') console.error('[admin/inventory:get]', e)
    return json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('inventory.manage')
    const b = await req.json()
    const id = String(b.id || '').trim()
    if (!id) return json({ error: 'Inventory item id is required' }, { status: 400 })
    const delta = clampInt(b.delta, -100000, 100000, 0)
    const reason = String(b.reason || 'Manual adjustment').trim().slice(0, 1000) || 'Manual adjustment'
    const movementType = String(b.movementType || '').toUpperCase() === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT'
    if (movementType === 'DAMAGE' && delta >= 0) return json({ error: 'Damage movements must reduce stock.' }, { status: 400 })
    const requestedLocation = b.location !== undefined ? String(b.location || '').trim().slice(0, 120) || 'Main' : undefined
    const threshold = b.lowStockThreshold !== undefined ? clampInt(b.lowStockThreshold, 0, 100000, 5) : undefined

    const updated = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${id} FOR UPDATE`
      const item = await tx.inventoryItem.findUnique({ where: { id } })
      if (!item) throw new Error('Inventory item not found')
      const next = item.quantity + delta
      if (next < item.reserved) throw new Error('Cannot reduce stock below reserved quantity')

      if (requestedLocation !== undefined && requestedLocation !== (item.location || 'Main')) {
        const collision = await tx.inventoryItem.findFirst({
          where: { id: { not: id }, productId: item.productId, variantId: item.variantId, location: requestedLocation },
          select: { id: true },
        })
        if (collision) throw new Error('That product/variant already has inventory at the selected location. Adjust the existing location record instead.')
      }

      await tx.inventoryItem.update({
        where: { id },
        data: { quantity: next, lowStockThreshold: threshold, location: requestedLocation },
      })

      if (delta !== 0) {
        await tx.inventoryMovement.create({ data: { inventoryId: id, type: movementType, quantity: delta, reason } })
      }

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id },
        include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } }, variant: true, movements: { orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT } },
      })
    })

    await audit(actor.id, 'inventory.adjusted', 'InventoryItem', id, { delta, reason, movementType, location: requestedLocation, lowStockThreshold: threshold })
    return json({ item: updated }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    const known = new Set([
      'Inventory item not found',
      'Cannot reduce stock below reserved quantity',
      'That product/variant already has inventory at the selected location. Adjust the existing location record instead.',
      'UNAUTHORIZED',
      'FORBIDDEN',
    ])
    if (!known.has(message)) console.error('[admin/inventory:patch]', e)
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message === 'Inventory item not found' ? 404 : known.has(message) ? 409 : 500
    const error = message === 'UNAUTHORIZED' ? 'Unauthorized' : message === 'FORBIDDEN' ? 'Forbidden' : known.has(message) ? message : 'Unable to adjust inventory'
    return json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
