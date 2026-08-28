import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { getPaymentProvider } from '@/lib/payments'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const RETURN_MESSAGES = new Set([
  'Order not found',
  'Only shipped or delivered orders can be returned',
  'A return refund can only be issued for a paid order',
])

function returnFailure(error: unknown) {
  if (error instanceof Error) {
    if (RETURN_MESSAGES.has(error.message)) return { message: error.message, status: error.message === 'Order not found' ? 404 : 400 }
    if (error.message === 'UNAUTHORIZED') return { message: 'Unauthorized', status: 401 }
    if (error.message === 'FORBIDDEN') return { message: 'Forbidden', status: 403 }
    if (error.message.startsWith('Invalid return quantity for ') || error.message.startsWith('Return quantity for ') || error.message.startsWith('No inventory row exists for ') || error.message.startsWith('Unable to restock ') || error.message.startsWith('Refund cannot exceed the remaining refundable amount of ')) {
      return { message: error.message, status: 400 }
    }
  }
  console.error('[admin/returns] unexpected failure', error)
  return { message: 'Unable to process the return right now.', status: 500 }
}

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
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, paymentTransactions: true } })
      if (!order) throw new Error('Order not found')
      if (!['SHIPPED', 'DELIVERED'].includes(order.status)) throw new Error('Only shipped or delivered orders can be returned')
      if (requestedRefund > 0 && !['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) throw new Error('A return refund can only be issued for a paid order')

      const returnId = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const orderItemById = new Map(order.items.map(item => [item.id, item]))
      const movementRows = await tx.inventoryMovement.findMany({ where: { referenceId: order.orderNumber, type: 'RETURN' } })
      const alreadyReturned = new Map<string, number>()
      for (const movement of movementRows) {
        const match = movement.reason?.match(/^Customer return ([^:]+):/)
        if (match) alreadyReturned.set(match[1], (alreadyReturned.get(match[1]) || 0) + Math.max(0, movement.quantity))
      }

      const requestedQuantities = new Map<string, number>()
      for (const raw of inputItems) {
        const orderItemId = String(raw.orderItemId || '').trim()
        const quantity = Number(raw.quantity)
        const item = orderItemById.get(orderItemId)
        if (!item) throw new Error(`Order item ${orderItemId} was not found`)
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid return quantity for ${item.name}`)
        const totalRequested = (requestedQuantities.get(orderItemId) || 0) + quantity
        if (totalRequested + (alreadyReturned.get(orderItemId) || 0) > item.quantity) throw new Error(`Return quantity for ${item.name} exceeds the quantity purchased`)
        requestedQuantities.set(orderItemId, totalRequested)
      }

      const normalized: Array<{ orderItemId: string; quantity: number; item: typeof order.items[number] }> = []
      for (const [orderItemId, quantity] of requestedQuantities) {
        const item = orderItemById.get(orderItemId)!
        normalized.push({ orderItemId, quantity, item })
      }

      const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
      const remainingRefundable = Math.max(0, order.grandTotal - refunded)
      if (requestedRefund > remainingRefundable) throw new Error(`Refund cannot exceed the remaining refundable amount of ${remainingRefundable}`)

      if (restock) {
        for (const entry of normalized) {
          const dedicated = await tx.inventoryItem.findMany({ where: { productId: entry.item.productId, variantId: entry.item.variantId || null }, orderBy: { id: 'asc' } })
          const shared = entry.item.variantId ? await tx.inventoryItem.findMany({ where: { productId: entry.item.productId, variantId: null }, orderBy: { id: 'asc' } }) : []
          const rows = dedicated.length ? dedicated : shared
          if (!rows.length) throw new Error(`No inventory row exists for ${entry.item.name}`)
          let remaining = entry.quantity
          for (const row of rows) {
            if (remaining <= 0) break
            const add = remaining
            await tx.inventoryItem.update({ where: { id: row.id }, data: { quantity: { increment: add } } })
            await tx.inventoryMovement.create({ data: { inventoryId: row.id, type: 'RETURN', quantity: add, reason: `Customer return ${entry.orderItemId}: ${String(body.reason || 'Returned item').slice(0, 1000)}`, referenceId: order.orderNumber } })
            remaining -= add
          }
          if (remaining > 0) throw new Error(`Unable to restock ${entry.item.name}`)
        }
      }

      const original = order.paymentTransactions
        .filter(t => t.provider !== 'manual' && ['paid', 'captured', 'authorized'].includes(t.status) && t.externalId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      const refundProvider = original?.provider || 'manual'
      const refundStatus = requestedRefund > 0 ? (refundProvider === 'manual' ? 'refunded' : 'refund_pending') : null
      const refund = requestedRefund > 0
        ? await tx.paymentTransaction.create({
            data: {
              orderId: order.id,
              provider: refundProvider,
              externalId: original?.externalId || null,
              status: refundStatus!,
              amount: requestedRefund,
              currency: order.currency,
              rawJson: JSON.stringify({ returnId, reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id }),
            },
          })
        : null

      const newRefundedTotal = refunded + (requestedRefund > 0 && refundStatus === 'refunded' ? requestedRefund : 0)
      const paymentStatus = refundStatus === 'refunded'
        ? (newRefundedTotal >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED')
        : order.paymentStatus
      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status: paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status, events: { create: { status: paymentStatus, message: `${returnId}: ${normalized.map(x => `${x.item.name} × ${x.quantity}`).join(', ')}${restock ? ' — restocked' : ' — not restocked'}${requestedRefund ? ` — ${refundStatus === 'refunded' ? `refunded ${requestedRefund} ${order.currency}` : `refund pending ${requestedRefund} ${order.currency}`}` : ''}` } } } })

      await audit(actor.id, 'order.returned', 'Order', order.id, {
        returnId,
        items: normalized.map(x => ({ orderItemId: x.orderItemId, quantity: x.quantity })),
        restocked: restock,
        refundId: refund?.id || null,
        refundAmount: requestedRefund,
        refundProvider,
      })

      return { order: updated, returnId, refund, refundProvider, refundExternalId: original?.externalId || null, items: normalized.map(x => ({ orderItemId: x.orderItemId, quantity: x.quantity })), restocked: restock }
    })

    if (result.refund && result.refundProvider !== 'manual') {
      try {
        if (!result.refundExternalId) throw new Error('Paid gateway transaction is missing its external reference')
        const provider = await getPaymentProvider(result.refundProvider)
        if (provider.name !== result.refundProvider || !provider.refundPayment) throw new Error(`Payment provider ${result.refundProvider} is not available for refunds`)
        const gatewayResult = await provider.refundPayment(result.refundExternalId, result.refund.amount, result.refund.currency)
        if (gatewayResult === 'refunded') {
          await db.$transaction(async tx => {
            await tx.paymentTransaction.update({ where: { id: result.refund!.id }, data: { status: 'refunded' } })
            await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${result.order.id} FOR UPDATE`
            const order = await tx.order.findUnique({ where: { id: result.order.id }, include: { paymentTransactions: true } })
            if (!order) throw new Error('Order not found')
            const successfulRefunds = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
            const paymentStatus = successfulRefunds >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
            await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status: paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status } })
            await tx.auditLog.create({ data: { actorId: actor.id, action: 'order.return_refund_completed', entity: 'Order', entityId: order.id, metadataJson: JSON.stringify({ returnId: result.returnId, refundId: result.refund!.id, amount: result.refund!.amount, provider: result.refundProvider }) } })
          })
        } else {
          await audit(actor.id, 'order.return_refund_pending', 'Order', result.order.id, { returnId: result.returnId, refundId: result.refund.id, amount: result.refund.amount, provider: result.refundProvider })
        }
      } catch (error) {
        await db.paymentTransaction.update({ where: { id: result.refund.id }, data: { status: 'refund_failed', rawJson: JSON.stringify({ returnId: result.returnId, error: error instanceof Error ? error.message : 'Gateway refund failed' }).slice(0, 5000) } })
        await audit(actor.id, 'order.return_refund_failed', 'Order', result.order.id, { returnId: result.returnId, refundId: result.refund.id, provider: result.refundProvider })
        return json({ ...result, error: 'Return processed, but the gateway refund failed. The refund remains marked failed for admin retry.' }, { status: 502 })
      }
    }

    if (result.order.userId) {
      try {
        await db.notification.create({ data: { userId: result.order.userId, title: `Return for ${result.order.orderNumber}`, body: `Your return ${result.returnId} was processed${result.refund ? ` with a ${result.refund.amount} ${result.order.currency} refund` : ''}.`, type: 'ORDER_REFUND' } })
      } catch {
        // Notification delivery must never make a committed return retryable.
      }
    }

    return json(result, { status: result.refund && result.refundProvider !== 'manual' && result.refund.status === 'refund_pending' ? 202 : 201 })
  } catch (e) {
    const failure = returnFailure(e)
    return json({ error: failure.message }, { status: failure.status })
  }
}
