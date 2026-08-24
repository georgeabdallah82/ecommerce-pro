import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('inventory.manage')
    const { id } = await params
    const b = await req.json()
    const po = await db.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
    if (!po) return json({ error: 'Purchase order not found' }, { status: 404 })
    const nextStatus = String(b.status || po.status)
    const valid = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']
    if (!valid.includes(nextStatus)) return json({ error: 'Invalid purchase order status' }, { status: 400 })
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') return json({ error: `Purchase order is already ${po.status.toLowerCase()}` }, { status: 409 })

    const receivedItems = Array.isArray(b.items) ? b.items.map((x: any) => ({ id: String(x.id), received: Math.max(0, Math.trunc(Number(x.received) || 0)) })) : []
    const updated = await db.$transaction(async tx => {
      if (receivedItems.length) {
        for (const received of receivedItems) {
          const item = po.items.find(i => i.id === received.id)
          if (!item) continue
          const increment = Math.max(0, received.received - item.quantityReceived)
          if (!increment) continue
          await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { quantityReceived: Math.min(item.quantityOrdered, received.received) } })
          const inventory = await tx.inventoryItem.findFirst({ where: { productId: item.productId, variantId: item.variantId, location: po.locationId || undefined } })
          if (inventory) {
            await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantity: { increment } } })
            await tx.inventoryMovement.create({ data: { inventoryId: inventory.id, type: 'RECEIPT', quantity: increment, reason: `Received ${po.number}`, referenceId: po.id } })
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
    return json({ purchaseOrder: updated })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update purchase order' }, { status: 400 }) }
}
