import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { InventoryMovementType, PaymentStatus } from '@prisma/client'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.refund')
    const { id } = await params
    const body = await req.json()
    const amount = Number(body.amount)
    const items = Array.isArray(body.items) ? body.items : []
    const order = await db.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })
    if (!Number.isInteger(amount) || amount <= 0 || amount > order.grandTotal) return json({ error: 'Invalid refund amount' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      let restored = 0
      for (const request of items) {
        const item = order.items.find(x => x.id === request.orderItemId)
        const qty = Number(request.quantity)
        if (!item || !Number.isInteger(qty) || qty <= 0 || qty > item.quantity) throw new Error('Invalid refund item')

        const fulfilled = await tx.inventoryMovement.aggregate({ _sum: { quantity: true }, where: { type: InventoryMovementType.SALE_FULFILLMENT, referenceId: order.orderNumber, inventory: { productId: item.productId } } })
        const returned = await tx.inventoryMovement.aggregate({ _sum: { quantity: true }, where: { type: InventoryMovementType.RETURN, referenceId: order.orderNumber, inventory: { productId: item.productId } } })
        const availableToReturn = Math.max(0, (fulfilled._sum.quantity ?? 0) - (returned._sum.quantity ?? 0))
        const restoreQty = Math.min(qty, availableToReturn)
        if (!restoreQty) continue

        const rows = await tx.inventoryItem.findMany({ where: { productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : { variantId: null }) }, orderBy: { id: 'asc' } })
        if (!rows.length) continue
        await tx.inventoryItem.update({ where: { id: rows[0].id }, data: { quantity: { increment: restoreQty } } })
        await tx.inventoryMovement.create({ data: { inventoryId: rows[0].id, type: InventoryMovementType.RETURN, quantity: restoreQty, reason: 'Customer refund/return', referenceId: order.orderNumber } })
        restored += restoreQty
      }

      const newStatus = amount >= order.grandTotal ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED
      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus: newStatus, events: { create: { status: 'REFUNDED', message: `Refund recorded: ${amount} ${order.currency}.` } }, paymentTransactions: { create: { provider: 'refund', status: 'refunded', amount, currency: order.currency, rawJson: JSON.stringify({ restoredQuantity: restored }).slice(0, 5000) } } } })
      return { updated, restored }
    })

    await audit(actor.id, 'order.refunded', 'Order', order.id, { amount, restoredQuantity: result.restored })
    return json({ order: result.updated, restoredQuantity: result.restored })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refund order'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
