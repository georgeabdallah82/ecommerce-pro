import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('inventory.manage')
    const { id } = await params
    const b = await req.json()
    const transfer = await db.inventoryTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: true, toLocation: true } })
    if (!transfer) return json({ error: 'Transfer not found' }, { status: 404 })
    const nextStatus = String(b.status || transfer.status)
    const valid = ['DRAFT','PENDING','IN_TRANSIT','RECEIVED','CANCELLED']
    if (!valid.includes(nextStatus)) return json({ error: 'Invalid transfer status' }, { status: 400 })
    if (transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') return json({ error: `Transfer is already ${transfer.status.toLowerCase()}` }, { status: 409 })

    if (nextStatus === 'RECEIVED') {
      if (!transfer.toLocation) return json({ error: 'A destination location is required before receiving a transfer' }, { status: 400 })
      await db.$transaction(async tx => {
        for (const item of transfer.items) {
          const qty = Math.max(0, item.quantity - item.received)
          if (!qty) continue
          const destination = await tx.inventoryItem.findFirst({ where: { productId: item.productId, variantId: item.variantId, location: transfer.toLocation!.name } })
          if (destination) {
            await tx.inventoryItem.update({ where: { id: destination.id }, data: { quantity: { increment: qty } } })
            await tx.inventoryMovement.create({ data: { inventoryId: destination.id, type: 'TRANSFER', quantity: qty, reason: `Received transfer ${transfer.reference}`, referenceId: transfer.id } })
          } else {
            const created = await tx.inventoryItem.create({ data: { productId: item.productId, variantId: item.variantId, quantity: qty, reserved: 0, lowStockThreshold: 5, location: transfer.toLocation!.name } })
            await tx.inventoryMovement.create({ data: { inventoryId: created.id, type: 'TRANSFER', quantity: qty, reason: `Received transfer ${transfer.reference}`, referenceId: transfer.id } })
          }
          await tx.inventoryTransferItem.update({ where: { id: item.id }, data: { received: item.quantity } })
        }
        await tx.inventoryTransfer.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: new Date() } })
      })
    } else if (nextStatus === 'IN_TRANSIT') {
      await db.inventoryTransfer.update({ where: { id }, data: { status: 'IN_TRANSIT', shippedAt: new Date() } })
    } else {
      await db.inventoryTransfer.update({ where: { id }, data: { status: nextStatus as any } })
    }
    await audit(actor.id, 'inventory.transfer.updated', 'InventoryTransfer', id, { from: transfer.status, to: nextStatus })
    return json({ transfer: await db.inventoryTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: true, toLocation: true } }) })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update transfer' }, { status: 400 }) }
}
