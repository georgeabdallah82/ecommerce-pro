import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { dispatchInventoryUpdated } from '@/lib/webhooks'

const PO_RECEIVE_CONFLICT_MESSAGE = 'This purchase order was just updated — please retry.'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('purchaseOrders.manage')
    const { id } = await params
    const b = await req.json()
    const po = await db.purchaseOrder.findUnique({ where: { id }, include: { items: true, location: true } })
    if (!po) return json({ error: 'Purchase order not found' }, { status: 404 })
    const nextStatus = String(b.status || po.status)
    const valid = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']
    if (!valid.includes(nextStatus)) return json({ error: 'Invalid purchase order status' }, { status: 400 })
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') return json({ error: `Purchase order is already ${po.status.toLowerCase()}` }, { status: 409 })
    if (nextStatus === 'RECEIVED' && !po.location) return json({ error: 'A receiving location is required before receiving a purchase order' }, { status: 400 })

    const suppliedReceived = new Map<string, number>()
    if (Array.isArray(b.items)) for (const x of b.items) suppliedReceived.set(String(x.id), Math.max(0, Math.trunc(Number(x.received) || 0)))
    // Marking a PO RECEIVED means every item is fully received, even if the client only sent
    // partial/no per-item counts - otherwise the PO would be closed out without crediting the
    // stock for the items it forgot to list.
    const receivedItems = nextStatus === 'RECEIVED'
      ? po.items.map(item => ({ id: item.id, received: suppliedReceived.get(item.id) ?? item.quantityOrdered }))
      : po.items.filter(item => suppliedReceived.has(item.id)).map(item => ({ id: item.id, received: suppliedReceived.get(item.id)! }))
    // A PO with no receiving location silently skipped the inventoryItem credit below (it's
    // gated on `if (po.location)`) while still marking items as received - stock would never
    // actually land anywhere, but the PO would show progress as if it had. Require a location
    // for any receiving action, not just the "mark fully received" one.
    if (receivedItems.length && !po.location) return json({ error: 'A receiving location is required before receiving items' }, { status: 400 })
    const receivedInventoryIds = new Set<string>()
    const updated = await db.$transaction(async tx => {
      if (receivedItems.length) {
        for (const received of receivedItems) {
          const item = po.items.find(i => i.id === received.id)
          if (!item) continue
          const nextReceived = Math.min(item.quantityOrdered, received.received)
          const increment = Math.max(0, nextReceived - item.quantityReceived)
          if (!increment) continue
          // item.quantityReceived was read from `po` before this transaction started, so a
          // concurrent PATCH on the same PO (a double-submit, or two staff receiving the same
          // shipment) could compute the same increment from the same stale value and both apply
          // it, double-crediting inventory for a single physical receipt. Binding the write to
          // the exact quantityReceived just read (mirroring the admin inventory PATCH's own
          // updateMany guard) makes the second concurrent request fail instead of re-applying it.
          const guarded = await tx.purchaseOrderItem.updateMany({ where: { id: item.id, quantityReceived: item.quantityReceived }, data: { quantityReceived: nextReceived } })
          if (guarded.count !== 1) throw new Error(PO_RECEIVE_CONFLICT_MESSAGE)
          if (po.location) {
            const inventory = await tx.inventoryItem.findFirst({ where: { productId: item.productId, variantId: item.variantId, locationId: po.locationId } })
            if (inventory) {
              await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantity: { increment } } })
              await tx.inventoryMovement.create({ data: { inventoryId: inventory.id, type: 'RECEIPT', quantity: increment, reason: `Received ${po.number}`, referenceId: po.id } })
              receivedInventoryIds.add(inventory.id)
            } else {
              const created = await tx.inventoryItem.create({ data: { productId: item.productId, variantId: item.variantId, quantity: increment, reserved: 0, lowStockThreshold: 5, locationId: po.locationId } })
              await tx.inventoryMovement.create({ data: { inventoryId: created.id, type: 'RECEIPT', quantity: increment, reason: `Received ${po.number}`, referenceId: po.id } })
              receivedInventoryIds.add(created.id)
            }
          }
        }
      }
      const finalItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } })
      const allReceived = finalItems.length > 0 && finalItems.every(i => i.quantityReceived >= i.quantityOrdered)
      const anyReceived = finalItems.some(i => i.quantityReceived > 0)
      const effectiveStatus = nextStatus === 'RECEIVED' || allReceived ? 'RECEIVED' : nextStatus === 'ORDERED' && anyReceived ? 'PARTIALLY_RECEIVED' : nextStatus
      return tx.purchaseOrder.update({ where: { id }, data: { status: effectiveStatus as any, orderedAt: effectiveStatus !== 'DRAFT' && effectiveStatus !== 'CANCELLED' ? (po.orderedAt || new Date()) : po.orderedAt, receivedAt: effectiveStatus === 'RECEIVED' ? new Date() : po.receivedAt }, include: { items: true, location: true } })
    })
    await audit(actor.id, 'purchase_order.updated', 'PurchaseOrder', id, { from: po.status, to: updated.status, receivedItems: receivedItems.length })
    dispatchInventoryUpdated(receivedInventoryIds)
    return json({ purchaseOrder: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update purchase order'
    return json({ error: message }, { status: message === PO_RECEIVE_CONFLICT_MESSAGE ? 409 : 400 })
  }
}
