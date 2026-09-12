import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('transfers.manage')
    const { id } = await params
    const b = await req.json()
    const transfer = await db.inventoryTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: true, toLocation: true } })
    if (!transfer) return json({ error: 'Transfer not found' }, { status: 404 })
    const nextStatus = String(b.status || transfer.status)
    const valid = ['DRAFT', 'PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']
    if (!valid.includes(nextStatus)) return json({ error: 'Invalid transfer status' }, { status: 400 })
    if (transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') return json({ error: `Transfer is already ${transfer.status.toLowerCase()}` }, { status: 409 })
    if (nextStatus === 'IN_TRANSIT' && transfer.status === 'IN_TRANSIT') return json({ error: 'Transfer is already in transit' }, { status: 409 })

    if (nextStatus === 'IN_TRANSIT') {
      if (!transfer.fromLocation) return json({ error: 'A source location is required before shipping a transfer' }, { status: 400 })
      if (!transfer.toLocation) return json({ error: 'A destination location is required before shipping a transfer' }, { status: 400 })
      await db.$transaction(async tx => {
        for (const item of transfer.items) {
          const source = await tx.inventoryItem.findFirst({ where: { productId: item.productId, variantId: item.variantId, locationId: transfer.fromLocationId } })
          if (!source) throw new Error(`No source inventory exists for product ${item.productId} at ${transfer.fromLocation!.name}`)
          const available = source.quantity - source.reserved
          if (available < item.quantity) throw new Error(`Not enough available stock to ship ${item.quantity} units from ${transfer.fromLocation!.name}`)
          await tx.inventoryItem.update({ where: { id: source.id }, data: { quantity: { decrement: item.quantity } } })
          await tx.inventoryMovement.create({ data: { inventoryId: source.id, type: 'TRANSFER', quantity: -item.quantity, reason: `Shipped transfer ${transfer.reference} to ${transfer.toLocation!.name}`, referenceId: transfer.id } })
        }
        await tx.inventoryTransfer.update({ where: { id }, data: { status: 'IN_TRANSIT', shippedAt: new Date() } })
      })
    } else if (nextStatus === 'RECEIVED') {
      if (!transfer.toLocation) return json({ error: 'A destination location is required before receiving a transfer' }, { status: 400 })
      if (transfer.status !== 'IN_TRANSIT') return json({ error: 'Transfer must be in transit before it can be received' }, { status: 409 })
      await db.$transaction(async tx => {
        for (const item of transfer.items) {
          const qty = Math.max(0, item.quantity - item.received)
          if (!qty) continue
          const destination = await tx.inventoryItem.findFirst({ where: { productId: item.productId, variantId: item.variantId, locationId: transfer.toLocationId } })
          if (destination) {
            await tx.inventoryItem.update({ where: { id: destination.id }, data: { quantity: { increment: qty } } })
            await tx.inventoryMovement.create({ data: { inventoryId: destination.id, type: 'TRANSFER', quantity: qty, reason: `Received transfer ${transfer.reference}`, referenceId: transfer.id } })
          } else {
            const created = await tx.inventoryItem.create({ data: { productId: item.productId, variantId: item.variantId, quantity: qty, reserved: 0, lowStockThreshold: 5, locationId: transfer.toLocationId } })
            await tx.inventoryMovement.create({ data: { inventoryId: created.id, type: 'TRANSFER', quantity: qty, reason: `Received transfer ${transfer.reference}`, referenceId: transfer.id } })
          }
          await tx.inventoryTransferItem.update({ where: { id: item.id }, data: { received: item.quantity } })
        }
        await tx.inventoryTransfer.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: new Date() } })
      })
    } else if (nextStatus === 'PENDING' || nextStatus === 'DRAFT') {
      if (transfer.status !== 'DRAFT' && transfer.status !== 'PENDING') return json({ error: 'This transfer cannot be moved back to a draft state' }, { status: 409 })
      await db.inventoryTransfer.update({ where: { id }, data: { status: nextStatus as any } })
    } else if (nextStatus === 'CANCELLED') {
      if (transfer.status === 'IN_TRANSIT') return json({ error: 'An in-transit transfer cannot be cancelled after stock has left the source. Receive it first or resolve it through an inventory adjustment.' }, { status: 409 })
      await db.inventoryTransfer.update({ where: { id }, data: { status: 'CANCELLED' } })
    }

    await audit(actor.id, 'inventory.transfer.updated', 'InventoryTransfer', id, { from: transfer.status, to: nextStatus })
    return json({ transfer: await db.inventoryTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: true, toLocation: true } }) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update transfer' }, { status: 400 })
  }
}
