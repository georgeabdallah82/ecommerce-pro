import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

/**
 * Records a physical customer return, optionally puts the returned quantity
 * back into sellable inventory, and optionally records a refund.
 *
 * Returns are represented by InventoryMovement rows so this works with the
 * current schema without requiring a database migration. Each return gets a
 * unique referenceId, making repeated returns auditable and allowing the API
 * to calculate how much of each order line has already been returned.
 */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json()
    const orderId = String(body.orderId || '').trim()
    const requestedRefund = Number(body.refundAmount || 0)
    const restock = body.restock !== false
    const inputItems = Array.isArray(body.items) ? body.items : []

    if (!orderId || !inputItems.length) {
      return json({ error: 'orderId and at least one return item are required' }, { status: 400 })
    }
    if (!Number.isInteger(requestedRefund) || requestedRefund < 0) {
      return json({ error: 'refundAmount must be a non-negative integer' }, { status: 400 })
    }

    const result = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, paymentTransactions: true },
      })
      if (!order) throw new Error('Order not found')
      if (!['SHIPPED', 'DELIVERED'].includes(order.status)) {
        throw new Error('Only shipped or delivered orders can be returned')
      }

      const returnId = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const orderItemById = new Map(order.items.map(item => [item.id, item]))
      const movementRows = await tx.inventoryMovement.findMany({
        where: { referenceId: order.orderNumber, type: 'RETURN' },
      })

      const alreadyReturned = new Map<string, number>()
      for (const movement of movementRows) {
        const match = movement.reason?.match(/^Customer return ([^:]+):/)
        if (!match) continue
        const orderItemId = match[1]
        alreadyReturned.set(orderItemId, (alreadyReturned.get(orderItemId) || 0) + Math.max(0, movement.quantity))
      }

      const normalized: Array<{ orderItemId: string; quantity: number; item: typeof order.items[number] }> = []
      for (const raw of inputItems) {
        const orderItemId = String(raw.orderItemId || '').trim()
        const quantity = Number(raw.quantity)
        const item = orderItemById.get(orderItemId)
        if (!item) throw new Error(`Order item ${orderItemId} was not found`)
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid return quantity for ${item.name}`)
        const returned = alreadyReturned.get(orderItemId) || 0
        if (returned + quantity > item.quantity) {
          throw new Error(`Return quantity for ${item.name} exceeds the quantity purchased`)
        }
        normalized.push({ orderItemId, quantity, item })
      }

      if (requestedRefund > 0) {
        const refunded = order.paymentTransactions
          .filter(t => t.status === 'refunded')
          .reduce((sum, t) => sum + t.amount, 0)
        const remainingRefundable = Math.max(0, order.grandTotal - refunded)
        if (requestedRefund > remainingRefundable) {
          throw new Error(`Refund cannot exceed the remaining refundable amount of ${remainingRefundable}`)
        }
      }

      for (const entry of normalized) {
        if (!restock) continue
        const rows = await tx.inventoryItem.findMany({
          where: { productId: entry.item.productId, variantId: entry.item.variantId || null },
          orderBy: { id: 'asc' },
        })
        const row = rows[0]
        if (!row) throw new Error(`No inventory row exists for ${entry.item.name}`)
        await tx.inventoryItem.update({
          where: { id: row.id },
          data: { quantity: { increment: entry.quantity } },
        })
        await tx.inventoryMovement.create({
          data: {
            inventoryId: row.id,
            type: 'RETURN',
            quantity: entry.quantity,
            reason: `Customer return ${entry.orderItemId}: ${body.reason || 'Returned item'}`,
            referenceId: order.orderNumber,
          },
        })
      }

      let refund: any = null
      let paymentStatus = order.paymentStatus
      if (requestedRefund > 0) {
        const refunded = order.paymentTransactions
          .filter(t => t.status === 'refunded')
          .reduce((sum, t) => sum + t.amount, 0)
        const newRefundedTotal = refunded + requestedRefund
        paymentStatus = newRefundedTotal >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
        refund = await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            provider: 'manual',
            status: 'refunded',
            amount: requestedRefund,
            currency: order.currency,
            rawJson: JSON.stringify({ returnId, reason: body.reason || null, actorId: actor.id }),
          },
        })
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus,
          events: {
            create: {
              status: paymentStatus,
              message: `${returnId}: ${normalized.map(x => `${x.item.name} × ${x.quantity}`).join(', ')}${restock ? ' — restocked' : ' — not restocked'}${requestedRefund ? ` — refunded ${requestedRefund} ${order.currency}` : ''}`,
            },
          },
        },
      })

      return { order: updated, returnId, refund, items: normalized.map(x => ({ orderItemId: x.orderItemId, quantity: x.quantity })), restocked: restock }
    })

    await audit(actor.id, 'order.returned', 'Order', orderId, {
      returnId: result.returnId,
      items: result.items,
      restocked: result.restocked,
      refundId: result.refund?.id || null,
      refundAmount: requestedRefund,
    })

    return json(result, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to process return' }, { status: 400 })
  }
}
