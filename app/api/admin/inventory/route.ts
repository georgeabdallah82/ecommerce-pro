import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, clampInt } from '@/lib/utils'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { checkLowStockAlerts } from '@/lib/push'

const HISTORY_LIMIT = 50

export async function GET() {
  try {
    await requirePermission('inventory.view')
    const rows = await db.inventoryItem.findMany({
      include: { product: true, variant: true, location: true, movements: { orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT } },
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
    const requestedLocationId = b.locationId !== undefined ? (b.locationId === null ? null : String(b.locationId).trim()) : undefined
    const threshold = b.lowStockThreshold !== undefined ? clampInt(b.lowStockThreshold, 0, 100000, 5) : undefined

    const updated = await db.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id } })
      if (!item) throw new Error('Inventory item not found')
      const next = item.quantity + delta
      if (next < item.reserved) throw new Error('Cannot reduce stock below reserved quantity')

      if (requestedLocationId !== undefined && requestedLocationId !== item.locationId) {
        if (requestedLocationId) {
          const location = await tx.storeLocation.findUnique({ where: { id: requestedLocationId }, select: { id: true } })
          if (!location) throw new Error('Selected location does not exist')
        }
        const collision = await tx.inventoryItem.findFirst({
          where: { id: { not: id }, productId: item.productId, variantId: item.variantId, locationId: requestedLocationId },
          select: { id: true },
        })
        if (collision) throw new Error('That product/variant already has inventory at the selected location. Adjust the existing location record instead.')
      }

      const write = await tx.inventoryItem.updateMany({
        where: { id, quantity: item.quantity, reserved: { lte: next } },
        data: { quantity: next, ...(threshold !== undefined ? { lowStockThreshold: threshold } : {}), ...(requestedLocationId !== undefined ? { locationId: requestedLocationId } : {}) },
      })
      if (write.count !== 1) throw new Error('Inventory changed concurrently; please retry the adjustment.')

      if (delta !== 0) await tx.inventoryMovement.create({ data: { inventoryId: id, type: movementType, quantity: delta, reason } })

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id },
        include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } }, variant: true, location: true, movements: { orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT } },
      })
    })

    await audit(actor.id, 'inventory.adjusted', 'InventoryItem', id, { delta, reason, movementType, locationId: requestedLocationId, lowStockThreshold: threshold })
    void dispatchWebhookEvent('inventory.updated', { id: updated.id, productId: updated.productId, variantId: updated.variantId, quantity: updated.quantity, reserved: updated.reserved, locationId: updated.locationId }).catch(error => console.error('[webhook] inventory.updated dispatch failed', error))
    if (delta < 0) void checkLowStockAlerts([updated.id]).catch(error => console.error('[push] low stock alert failed', error))
    return json({ item: updated }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    const known = new Set([
      'Inventory item not found',
      'Cannot reduce stock below reserved quantity',
      'Selected location does not exist',
      'That product/variant already has inventory at the selected location. Adjust the existing location record instead.',
      'Inventory changed concurrently; please retry the adjustment.',
      'UNAUTHORIZED',
      'FORBIDDEN',
    ])
    if (!known.has(message)) console.error('[admin/inventory:patch]', e)
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message === 'Inventory item not found' ? 404 : known.has(message) ? 409 : 500
    const error = message === 'UNAUTHORIZED' ? 'Unauthorized' : message === 'FORBIDDEN' ? 'Forbidden' : known.has(message) ? message : 'Unable to adjust inventory'
    return json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
