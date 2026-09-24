import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { dispatchWebhookEvent, dispatchInventoryUpdated } from '@/lib/webhooks'
import { restockReturnEntries, remainingRefundable, pickRefundSource, settleReturnRefund, creditWalletRefund, restoreCoinsForRefund, type ReturnableOrder, type ReturnOrderItem } from '@/lib/returns'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { sendReturnStatusEmail } from '@/lib/email'
import { Prisma } from '@prisma/client'

const RETURN_CONFLICT_MESSAGE = 'This order was just modified — please retry.'

// Informational only -- doesn't affect the restock/refund decision, which stays a
// whole-return toggle (existing.restock / body.restock). Lets whoever receives the
// return record what actually came back, e.g. to flag a damaged item for someone
// reviewing the return later even though it was (or wasn't) put back into stock.
const RETURN_ITEM_CONDITIONS = new Set(['GOOD', 'DAMAGED', 'MISSING_PARTS', 'OPENED'])

const RETURN_MESSAGES = new Set([
  'Return request not found',
  'Only a requested return can be approved',
  'Only a requested or approved return can be rejected',
  'Only a requested or approved return can be received',
  'A return refund can only be issued for a paid order',
  'Unknown action',
])

function returnFailure(error: unknown) {
  if (error instanceof Error) {
    if (RETURN_MESSAGES.has(error.message)) return { message: error.message, status: error.message === 'Return request not found' ? 404 : 400 }
    if (error.message === 'UNAUTHORIZED') return { message: 'Unauthorized', status: 401 }
    if (error.message === 'FORBIDDEN') return { message: 'Forbidden', status: 403 }
    if (error.message === RETURN_CONFLICT_MESSAGE) return { message: RETURN_CONFLICT_MESSAGE, status: 409 }
    if (error.message.startsWith('No inventory row exists for ') || error.message.startsWith('Unable to restock ') || error.message.startsWith('Refund cannot exceed the remaining refundable amount of ')) return { message: error.message, status: 400 }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return { message: RETURN_CONFLICT_MESSAGE, status: 409 }
  console.error('[admin/returns/:id] unexpected failure', error)
  return { message: 'Unable to process this return right now.', status: 500 }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('returns.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'approve') {
      const updated = await db.$transaction(async tx => {
        const existing = await tx.returnRequest.findUnique({ where: { id } })
        if (!existing) throw new Error('Return request not found')
        if (existing.status !== 'REQUESTED') throw new Error('Only a requested return can be approved')
        return tx.returnRequest.update({ where: { id }, data: { status: 'APPROVED' } })
      })
      await notifyCustomer(updated.orderId, `Your return request was approved`, `Your return request ${updated.id} was approved. Please ship the items back and we'll process it once received.`)
      void sendReturnStatusEmail(updated.id, updated.orderId).catch(error => console.error('[email] return status email failed', error))
      await audit(actor.id, 'return.approved', 'ReturnRequest', id, {})
      return json({ returnRequest: updated })
    }

    if (action === 'reject') {
      const note = body.note ? String(body.note).trim().slice(0, 1000) : null
      const updated = await db.$transaction(async tx => {
        const existing = await tx.returnRequest.findUnique({ where: { id } })
        if (!existing) throw new Error('Return request not found')
        if (!['REQUESTED', 'APPROVED'].includes(existing.status)) throw new Error('Only a requested or approved return can be rejected')
        return tx.returnRequest.update({ where: { id }, data: { status: 'REJECTED', notes: note } })
      })
      await notifyCustomer(updated.orderId, `Your return request was declined`, `Your return request ${updated.id} was declined.${note ? ` ${note}` : ''}`)
      void sendReturnStatusEmail(updated.id, updated.orderId).catch(error => console.error('[email] return status email failed', error))
      await audit(actor.id, 'return.rejected', 'ReturnRequest', id, { note })
      return json({ returnRequest: updated })
    }

    if (action === 'receive') {
      const requestedRefund = Number(body.refundAmount || 0)
      if (!Number.isInteger(requestedRefund) || requestedRefund < 0) return json({ error: 'refundAmount must be a non-negative integer' }, { status: 400 })
      if (requestedRefund > 0 && !hasPermission(actor.role, 'orders.refund')) throw new Error('FORBIDDEN')
      const itemConditions: Record<string, unknown> = body.itemConditions && typeof body.itemConditions === 'object' ? body.itemConditions : {}

      const result = await db.$transaction(async tx => {
        const existing = await tx.returnRequest.findUnique({ where: { id }, include: { items: true } })
        if (!existing) throw new Error('Return request not found')
        if (!['REQUESTED', 'APPROVED'].includes(existing.status)) throw new Error('Only a requested or approved return can be received')
        const restock = body.restock !== undefined ? body.restock !== false : existing.restock

        // Applied before returnRequest.update's `include: { items: true }` below re-reads
        // the items, so the response reflects the conditions just recorded.
        for (const item of existing.items) {
          const condition = itemConditions[item.id]
          if (typeof condition === 'string' && RETURN_ITEM_CONDITIONS.has(condition)) {
            await tx.returnItem.update({ where: { id: item.id }, data: { condition } })
          }
        }

        const orderRow = await tx.order.findUnique({ where: { id: existing.orderId }, include: { items: true, paymentTransactions: true } })
        if (!orderRow) throw new Error('Order not found')
        if (requestedRefund > 0 && !['PAID', 'PARTIALLY_REFUNDED'].includes(orderRow.paymentStatus)) throw new Error('A return refund can only be issued for a paid order')

        const order = orderRow as unknown as ReturnableOrder
        const orderItemById = new Map(order.items.map(item => [item.id, item]))
        const entries = existing.items.map(x => {
          const item = orderItemById.get(x.orderItemId) as ReturnOrderItem | undefined
          if (!item) throw new Error(`Order item ${x.orderItemId} was not found`)
          return { orderItemId: x.orderItemId, quantity: x.quantity, item }
        })

        const refundable = remainingRefundable(order)
        if (requestedRefund > refundable) throw new Error(`Refund cannot exceed the remaining refundable amount of ${refundable}`)
        const refunded = order.grandTotal - refundable

        // Same optimistic-concurrency guard as the direct-create admin return flow.
        const guarded = await tx.order.updateMany({ where: { id: order.id, updatedAt: order.updatedAt }, data: { updatedAt: new Date() } })
        if (guarded.count !== 1) throw new Error(RETURN_CONFLICT_MESSAGE)

        const restockedInventoryIds = restock ? await restockReturnEntries(tx, entries, order.orderNumber, existing.reason) : new Set<string>()

        const { refundProvider, refundExternalId } = pickRefundSource(order)
        const refundStatus = requestedRefund > 0 ? (refundProvider === 'manual' || refundProvider === 'wallet' ? 'refunded' : 'refund_pending') : null
        const returnRequest = await tx.returnRequest.update({ where: { id }, data: { status: 'RECEIVED', restock, refundAmount: requestedRefund, receivedAt: new Date() }, include: { items: true } })

        const refund = requestedRefund > 0 ? await tx.paymentTransaction.create({ data: { orderId: order.id, provider: refundProvider, externalId: refundExternalId, status: refundStatus!, amount: requestedRefund, currency: order.currency, rawJson: JSON.stringify({ returnId: returnRequest.id, actorId: actor.id }) } }) : null
        if (refund && refundProvider === 'wallet') await creditWalletRefund(tx, { userId: order.userId, refundId: refund.id, amount: requestedRefund, currency: order.currency })
        const newRefundedTotal = refunded + (requestedRefund > 0 && refundStatus === 'refunded' ? requestedRefund : 0)
        const paymentStatus = refundStatus === 'refunded' ? (newRefundedTotal >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : orderRow.paymentStatus
        if (refund && refundStatus === 'refunded') {
          await restoreCoinsForRefund(tx, { order, successfulRefunds: newRefundedTotal, refundId: refund.id })
          const redeemedGift = redeemedGiftCard(order.paymentTransactions)
          if (redeemedGift) await restoreGiftCardBalance(tx, order.id, redeemedGift, newRefundedTotal, order.grandTotal)
        }
        const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status: paymentStatus === 'REFUNDED' ? 'REFUNDED' : orderRow.status, events: { create: { status: paymentStatus, message: `${returnRequest.id} received: ${entries.map(x => `${x.item.name} × ${x.quantity}`).join(', ')}${restock ? ' — restocked' : ' — not restocked'}${requestedRefund ? ` — ${refundStatus === 'refunded' ? `refunded ${requestedRefund} ${order.currency}` : `refund pending ${requestedRefund} ${order.currency}`}` : ''}` } } } })

        await audit(actor.id, 'return.received', 'ReturnRequest', id, { orderId: order.id, restocked: restock, refundId: refund?.id || null, refundAmount: requestedRefund, refundProvider })
        return { order: updatedOrder, returnRequest, refund, refundProvider, refundExternalId, restockedInventoryIds: [...restockedInventoryIds] }
      })

      void dispatchWebhookEvent('order.updated', { id: result.order.id, orderNumber: result.order.orderNumber, status: result.order.status, paymentStatus: result.order.paymentStatus }).catch(error => console.error('[webhook] order.updated dispatch failed', error))
      dispatchInventoryUpdated(result.restockedInventoryIds)

      let refundEmailSent = false
      if (result.refund && result.refundProvider !== 'manual' && result.refundProvider !== 'wallet') {
        const settled = await settleReturnRefund(actor.id, { returnId: result.returnRequest.id, orderId: result.order.id, refundId: result.refund.id, refundProvider: result.refundProvider, refundExternalId: result.refundExternalId, amount: result.refund.amount, currency: result.refund.currency })
        if (!settled.ok) return json({ ...result, error: 'Return received, but the gateway refund failed. The refund remains marked failed for admin retry.' }, { status: 502 })
        refundEmailSent = settled.completed
      }

      await notifyCustomer(result.order.id, `Your return was received`, `We received your return ${result.returnRequest.id}.${result.refund ? ` A ${(result.refund.amount / 100).toFixed(2)} ${result.order.currency} refund is on its way.` : ''}`)
      // Skip when settleReturnRefund above already sent the REFUNDED email for us -- otherwise
      // (manual/no refund, or a still-pending gateway refund) this return's status is RECEIVED
      // and hasn't been emailed yet.
      if (!refundEmailSent) void sendReturnStatusEmail(result.returnRequest.id, result.order.id).catch(error => console.error('[email] return status email failed', error))

      return json(result, { status: result.refund && result.refundProvider !== 'manual' && result.refund.status === 'refund_pending' ? 202 : 200 })
    }

    throw new Error('Unknown action')
  } catch (e) {
    const failure = returnFailure(e)
    return json({ error: failure.message }, { status: failure.status })
  }
}

async function notifyCustomer(orderId: string, title: string, body: string) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true } })
    if (!order?.userId) return
    await db.notification.create({ data: { userId: order.userId, title, body, type: 'ORDER_REFUND' } })
  } catch (error) {
    console.error('[admin/returns/:id] notification failed', error)
  }
}
