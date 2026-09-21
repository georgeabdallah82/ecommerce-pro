import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { dispatchWebhookEvent, dispatchInventoryUpdated } from '@/lib/webhooks'
import { alreadyReturnedQuantities, normalizeReturnItems, remainingRefundable, restockReturnEntries, pickRefundSource, settleReturnRefund, creditWalletRefund, restoreCoinsForRefund, type ReturnableOrder } from '@/lib/returns'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { sendReturnStatusEmail } from '@/lib/email'
import { Prisma } from '@prisma/client'

const RETURN_MESSAGES = new Set([
  'Order not found',
  'Only shipped or delivered orders can be returned',
  'A return refund can only be issued for a paid order',
  'At least one return item is required',
])

const RETURN_CONFLICT_MESSAGE = 'This order was just modified — please retry.'

// ReturnRequest only carries a scalar orderId (no navigable `order` relation on this
// model), so the order summary each row needs for display is looked up separately here
// and stitched back onto each return by id rather than requested via `include`.
export async function GET(req: Request) {
  try {
    await requirePermission('returns.view')
    const params = new URL(req.url).searchParams
    const status = params.get('status') || undefined
    const rows = await db.returnRequest.findMany({
      where: status ? { status: status as any } : undefined,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const orderIds = Array.from(new Set(rows.map(r => r.orderId)))
    const orders = orderIds.length
      ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, email: true, grandTotal: true, currency: true, status: true, items: { select: { id: true, name: true } } } })
      : []
    const orderById = new Map(orders.map(o => [o.id, o]))
    return json(rows.map(r => ({ ...r, order: orderById.get(r.orderId) || null })))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

function returnFailure(error: unknown) {
  if (error instanceof Error) {
    if (RETURN_MESSAGES.has(error.message)) return { message: error.message, status: error.message === 'Order not found' ? 404 : 400 }
    if (error.message === 'UNAUTHORIZED') return { message: 'Unauthorized', status: 401 }
    if (error.message === 'FORBIDDEN') return { message: 'Forbidden', status: 403 }
    if (error.message === RETURN_CONFLICT_MESSAGE) return { message: RETURN_CONFLICT_MESSAGE, status: 409 }
    if (error.message.startsWith('Invalid return quantity for ') || error.message.startsWith('Return quantity for ') || error.message.startsWith('No inventory row exists for ') || error.message.startsWith('Unable to restock ') || error.message.startsWith('Refund cannot exceed the remaining refundable amount of ')) return { message: error.message, status: 400 }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return { message: RETURN_CONFLICT_MESSAGE, status: 409 }
  console.error('[admin/returns] unexpected failure', error)
  return { message: 'Unable to process the return right now.', status: 500 }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('returns.manage')
    const body = await req.json()
    const orderId = String(body.orderId || '').trim()
    const requestedRefund = Number(body.refundAmount || 0)
    const restock = body.restock !== false
    const inputItems = Array.isArray(body.items) ? body.items.slice(0, 100) : []

    if (!orderId || !inputItems.length) return json({ error: 'orderId and at least one return item are required' }, { status: 400 })
    if (!Number.isInteger(requestedRefund) || requestedRefund < 0) return json({ error: 'refundAmount must be a non-negative integer' }, { status: 400 })
    // A return that also issues a refund moves money, same as the standalone
    // refund endpoint (app/api/admin/refunds/route.ts) -- gate it on the same
    // orders.refund permission rather than letting orders.manage/returns.manage
    // (which SUPPORT holds without orders.refund) issue refunds through here.
    if (requestedRefund > 0 && !hasPermission(actor.role, 'orders.refund')) throw new Error('FORBIDDEN')

    const result = await db.$transaction(async tx => {
      const orderRow = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, paymentTransactions: true } })
      if (!orderRow) throw new Error('Order not found')
      if (!['SHIPPED', 'DELIVERED'].includes(orderRow.status)) throw new Error('Only shipped or delivered orders can be returned')
      if (requestedRefund > 0 && !['PAID', 'PARTIALLY_REFUNDED'].includes(orderRow.paymentStatus)) throw new Error('A return refund can only be issued for a paid order')

      const order = orderRow as unknown as ReturnableOrder
      const alreadyReturned = await alreadyReturnedQuantities(tx, order.id, order.orderNumber)
      const normalized = normalizeReturnItems(order, inputItems, alreadyReturned)

      const refundable = remainingRefundable(order)
      if (requestedRefund > refundable) throw new Error(`Refund cannot exceed the remaining refundable amount of ${refundable}`)
      const refunded = order.grandTotal - refundable

      // Tie the remaining-refundable snapshot above to an atomic conditional write on the
      // order (bounded on the updatedAt we just read) so a concurrent refund/return request
      // reading the same snapshot loses the race here instead of both succeeding together.
      const guarded = await tx.order.updateMany({ where: { id: order.id, updatedAt: order.updatedAt }, data: { updatedAt: new Date() } })
      if (guarded.count !== 1) throw new Error(RETURN_CONFLICT_MESSAGE)

      const restockedInventoryIds = restock ? await restockReturnEntries(tx, normalized, order.orderNumber, String(body.reason || 'Returned item')) : new Set<string>()

      const { refundProvider, refundExternalId } = pickRefundSource(order)
      const refundStatus = requestedRefund > 0 ? (refundProvider === 'manual' || refundProvider === 'wallet' ? 'refunded' : 'refund_pending') : null
      const returnRequest = await tx.returnRequest.create({
        data: {
          orderId: order.id,
          status: 'RECEIVED',
          reason: String(body.reason || 'Customer return').slice(0, 1000),
          notes: null,
          refundAmount: requestedRefund,
          restock,
          receivedAt: new Date(),
          items: { create: normalized.map(x => ({ orderItemId: x.orderItemId, productId: x.item.productId, variantId: x.item.variantId, quantity: x.quantity })) },
        },
        include: { items: true },
      })

      const refund = requestedRefund > 0 ? await tx.paymentTransaction.create({ data: { orderId: order.id, provider: refundProvider, externalId: refundExternalId, status: refundStatus!, amount: requestedRefund, currency: order.currency, rawJson: JSON.stringify({ returnId: returnRequest.id, reason: String(body.reason || '').slice(0, 1000) || null, actorId: actor.id }) } }) : null
      if (refund && refundProvider === 'wallet') await creditWalletRefund(tx, { userId: order.userId, refundId: refund.id, amount: requestedRefund, currency: order.currency })
      const newRefundedTotal = refunded + (requestedRefund > 0 && refundStatus === 'refunded' ? requestedRefund : 0)
      const paymentStatus = refundStatus === 'refunded' ? (newRefundedTotal >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : orderRow.paymentStatus
      if (refund && refundStatus === 'refunded') {
        await restoreCoinsForRefund(tx, { order, successfulRefunds: newRefundedTotal, refundId: refund.id })
        const redeemedGift = redeemedGiftCard(order.paymentTransactions)
        if (redeemedGift) await restoreGiftCardBalance(tx, order.id, redeemedGift, newRefundedTotal, order.grandTotal)
      }
      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status: paymentStatus === 'REFUNDED' ? 'REFUNDED' : orderRow.status, events: { create: { status: paymentStatus, message: `${returnRequest.id}: ${normalized.map(x => `${x.item.name} × ${x.quantity}`).join(', ')}${restock ? ' — restocked' : ' — not restocked'}${requestedRefund ? ` — ${refundStatus === 'refunded' ? `refunded ${requestedRefund} ${order.currency}` : `refund pending ${requestedRefund} ${order.currency}`}` : ''}` } } } })

      await audit(actor.id, 'order.returned', 'Order', order.id, { returnId: returnRequest.id, items: normalized.map(x => ({ orderItemId: x.orderItemId, quantity: x.quantity })), restocked: restock, refundId: refund?.id || null, refundAmount: requestedRefund, refundProvider })
      return { order: updated, returnRequest, returnId: returnRequest.id, refund, refundProvider, refundExternalId, items: normalized.map(x => ({ orderItemId: x.orderItemId, quantity: x.quantity })), restocked: restock, restockedInventoryIds: [...restockedInventoryIds] }
    })

    void dispatchWebhookEvent('order.updated', { id: result.order.id, orderNumber: result.order.orderNumber, status: result.order.status, paymentStatus: result.order.paymentStatus }).catch(error => console.error('[webhook] order.updated dispatch failed', error))
    dispatchInventoryUpdated(result.restockedInventoryIds)

    let refundEmailSent = false
    if (result.refund && result.refundProvider !== 'manual' && result.refundProvider !== 'wallet') {
      const settled = await settleReturnRefund(actor.id, { returnId: result.returnId, orderId: result.order.id, refundId: result.refund.id, refundProvider: result.refundProvider, refundExternalId: result.refundExternalId, amount: result.refund.amount, currency: result.refund.currency })
      if (!settled.ok) return json({ ...result, error: 'Return processed, but the gateway refund failed. The refund remains marked failed for admin retry.' }, { status: 502 })
      refundEmailSent = settled.completed
    }

    if (result.order.userId) {
      try {
        await db.notification.create({ data: { userId: result.order.userId, title: `Return for ${result.order.orderNumber}`, body: `Your return ${result.returnId} was processed${result.refund ? ` with a ${result.refund.amount} ${result.order.currency} refund` : ''}.`, type: 'ORDER_REFUND' } })
      } catch {
        // Notification delivery must never make a committed return retryable.
      }
    }
    // Skip when settleReturnRefund above already sent the REFUNDED email for us -- otherwise
    // (manual/no refund, or a still-pending gateway refund) this return's status is RECEIVED
    // and hasn't been emailed yet.
    if (!refundEmailSent) void sendReturnStatusEmail(result.returnId, result.order.id).catch(error => console.error('[email] return status email failed', error))

    return json(result, { status: result.refund && result.refundProvider !== 'manual' && result.refund.status === 'refund_pending' ? 202 : 201 })
  } catch (e) {
    const failure = returnFailure(e)
    return json({ error: failure.message }, { status: failure.status })
  }
}
