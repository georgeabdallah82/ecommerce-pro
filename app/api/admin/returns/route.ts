import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json()
    const orderId = String(body.orderId || '').trim()
    const requestedRefund = Number(body.refundAmount || 0)
    const restock = body.restock !== false
    const inputItems = Array.isArray(body.items) ? body.items : []

    if (!orderId || !inputItems.length) return json({ error: 'orderId and at least one return item are required' }, { status: 400 })
    if (!Number.isInteger(requestedRefund) || requestedRefund < 0) return json({ error: 'refundAmount must be a non-negative integer' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, paymentTransactions: true } })
      if (!order) throw new Error('Order not found')
      if (!['SHIPPED', 'DELIVERED'].includes(order.status)) throw new Error('Only shipped or delivered orders can be returned')

      const returnId = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const orderItemById = new Map(order.items.map(item => [item.id, item]))
      const movementRows = await tx.inventoryMovement.findMany({ where: { referenceId: order.orderNumber, type: 'RETURN' } })
      const alreadyReturned = new Map<string, number>()
      for (const movement of movementRows) {
        const match = movement.reason?.match(/^Customer return ([^:]+):/)
        if (match) alreadyReturned.set(match[1], (alreadyReturned.get(match[1]) || 0) + Math.max(0, movement.quantity))
      }

      const normalized: Array<{ orderItemId: string; quantity: number; item: typeof order.items[number] }> = []
      for (const raw of inputItems) {
        const orderItemId = String(raw.orderItemId || '').trim()
        const quantity = Number(raw.quantity)
        const item = orderItemById.get(orderItemId)
        if (!item) throw new Error(`Order item ${orderItemId} was not found`)
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid return quantity for ${item.name}`)
        if ((alreadyReturned.get(orderItemId) || 0) + quantity > item.quantity) throw new Error(`Return quantity for ${item.name} exceeds the quantity purchased`)
        normalized.push({ orderItemId, quantity, item })
      }

      const refunded = order.paymentTransactions.filter(t => t.status === 'refunded').reduce((sum, t) => sum + t.amount, 0)
      const remainingRefundable = Math.max(0, order.grandTotal - refunded)
      if (requestedRefund > remainingRefundable) throw new Error(`Refund cannot exceed the remaining refundable amount of ${remainingRefundable}`)

      if (restock) {
        for (const entry of normalized) {
          const rows = await tx.inventoryItem.findMany({ where: { productId: entry.item.productId, variantId: entry.item.variantId || null }, orderBy: { id: 'asc' } })
          if (!rows.length) throw new Error(`No inventory row exists for ${entry.item.name}`)
          let remaining = entry.quantity
          for (const row of rows) {
            if (remaining <= 0) break
            const add = remaining
            await tx.inventoryItem.update({ where: { id: row.id }, data: { quantity: { increment: add } } })
            await tx.inventoryMovement.create({ data: { inventoryId: row.id, type: 'RETURN', quantity: add, reason: `Customer return ${entry.orderItemId}: ${body.reason || 'Returned item'}`, referenceId: order.orderNumber } })
            remaining -= add
          }
          if (remaining > 0) throw new Error(`Unable to restock ${entry.item.name}`)
        }
      }

      let refund: any = null
      const newRefundedTotal = refunded + requestedRefund
      const paymentStatus = requestedRefund > 0 ? (newRefundedTotal >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : order.paymentStatus
      if (requestedRefund > 0) {
        refund = await tx.paymentTransaction.create({ data: { orderId: order.id, provider: 'manual', status: 'refunded', amount: requestedRefund, currency: order.currency, rawJson: JSON.stringify({ returnId, reason: body.reason || null, actorId: actor.id }) } })
      }

      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status: paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status, events: { create: { status: paymentStatus, message: `${returnId}: ${normalized.map(x => `${x.item.name} × ${x.quantity}`).join(', ')}${restock ? ' — restocked' : ' — not restocked'}${requestedRefund ? ` — refunded ${requestedRefund} ${order.currency}` : ''}` } } } })
      return { order: updated, returnId, refund, items: normalized.map(x => ({ orderItemId: x.orderItemId, quantity: x.quantity })), restocked: restock }
    })

    await audit(actor.id, 'order.returned', 'Order', orderId, { returnId: result.returnId, items: result.items, restocked: result.restocked, refundId: result.refund?.id || null, refundAmount: requestedRefund })
    return json(result, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to process return' }, { status: 400 })
  }
}
