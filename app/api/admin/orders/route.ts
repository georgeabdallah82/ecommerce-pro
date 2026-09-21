import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { canTransitionOrder, canTransitionPayment, fulfillmentForStatus } from '@/lib/orders'
import { fulfillOrderStock, releaseOrderReservations, pickMajorityLocation } from '@/lib/inventory'
import { remainingRefundable, pickRefundSource, creditWalletRefund, settleReturnRefund, type ReturnableOrder } from '@/lib/returns'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { json } from '@/lib/utils'
import { dispatchWebhookEvent, dispatchInventoryUpdated } from '@/lib/webhooks'
import { sendFulfillmentEmail, issueAndNotifyGiftCardsForOrder } from '@/lib/email'
import { checkLowStockAlerts } from '@/lib/push'
import { OrderStatus, PaymentStatus } from '@prisma/client'

// Mirrors the identically-shaped helper in app/api/account/orders/[orderNumber]/cancel/route.ts --
// coins redeemed at checkout are only ever recorded inline on the checkout PaymentTransaction's
// rawJson (no separate ledger to query), so reading them back means parsing that same blob.
function redeemedCancelCoins(paymentTransactions: Array<{ provider: string; rawJson: string | null }>) {
  const checkout = paymentTransactions.find(t => t.provider === 'checkout' && t.rawJson)
  if (!checkout?.rawJson) return 0
  try {
    const parsed = JSON.parse(checkout.rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

const ORDER_STATUSES = new Set(Object.values(OrderStatus))
const PAYMENT_STATUSES = new Set(Object.values(PaymentStatus))

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const q = sp.get('q')?.trim()
    const requestedPage = Number(sp.get('page') || 1)
    const requestedLimit = Number(sp.get('limit') || 50)
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1
    const limit = Number.isFinite(requestedLimit) ? Math.min(200, Math.max(1, Math.floor(requestedLimit))) : 50
    if (status && !ORDER_STATUSES.has(status as OrderStatus)) return json({ error: 'Invalid order status' }, { status: 400 })
    const where = { ...(status ? { status: status as OrderStatus } : {}), ...(q ? { OR: [{ orderNumber: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q, mode: 'insensitive' as const } }, { user: { is: { name: { contains: q, mode: 'insensitive' as const } } } }] } : {}) }
    const [rows,total] = await Promise.all([
      db.order.findMany({ where, include: { user: true, items: true }, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit }),
      db.order.count({ where }),
    ])
    return json({ rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total/limit)) } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json()
    const orderId = String(body.id || '').trim()
    if (!orderId) return json({ error: 'Order id is required' }, { status: 400 })

    const noteBody = typeof body.addNote === 'string' ? body.addNote.trim().slice(0, 5000) : ''
    if (noteBody) {
      const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true } })
      if (!order) return json({ error: 'Order not found' }, { status: 404 })
      const note = await db.orderNote.create({ data: { orderId: order.id, userId: actor.id, body: noteBody }, include: { user: true } })
      await audit(actor.id, 'order.note_added', 'Order', order.id, { noteId: note.id })
      return json({ note }, { status: 201 })
    }

    const requestedStatus = typeof body.status === 'string' && body.status ? body.status as OrderStatus : undefined
    const requestedPayment = typeof body.paymentStatus === 'string' && body.paymentStatus ? body.paymentStatus as PaymentStatus : undefined
    if (requestedStatus && !ORDER_STATUSES.has(requestedStatus)) return json({ error: 'Invalid order status' }, { status: 400 })
    if (requestedPayment && !PAYMENT_STATUSES.has(requestedPayment)) return json({ error: 'Invalid payment status' }, { status: 400 })
    if (requestedPayment === PaymentStatus.REFUNDED || requestedPayment === PaymentStatus.PARTIALLY_REFUNDED) return json({ error: 'Use the refund/return workflow to create a refund transaction' }, { status: 400 })
    if (requestedStatus === OrderStatus.REFUNDED) return json({ error: 'Use the refund/return workflow to create a refund transaction' }, { status: 400 })

    const detailsPatch: Record<string, unknown> = {}
    if (body.email !== undefined) {
      const email = String(body.email || '').trim().slice(0, 320)
      if (!email || !email.includes('@')) return json({ error: 'A valid customer email is required' }, { status: 400 })
      detailsPatch.email = email
    }
    if (body.phone !== undefined) detailsPatch.phone = String(body.phone || '').trim().slice(0, 80) || null
    if (body.shippingAddressJson !== undefined) {
      const value = String(body.shippingAddressJson || '').trim()
      if (!value) return json({ error: 'Shipping address is required' }, { status: 400 })
      try { JSON.parse(value) } catch { return json({ error: 'Shipping address must be valid JSON' }, { status: 400 }) }
      detailsPatch.shippingAddressJson = value.slice(0, 12000)
    }
    if (body.billingAddressJson !== undefined) {
      const value = String(body.billingAddressJson || '').trim()
      detailsPatch.billingAddressJson = value ? value.slice(0, 12000) : null
      if (value) { try { JSON.parse(value) } catch { return json({ error: 'Billing address must be valid JSON' }, { status: 400 }) } }
    }
    if (body.notes !== undefined) detailsPatch.notes = String(body.notes || '').trim().slice(0, 5000) || null
    if (body.trackingNumber !== undefined) detailsPatch.trackingNumber = String(body.trackingNumber || '').trim().slice(0, 120) || null
    // Carrier name and tracking URL aren't Order columns -- they're only meaningful attached to
    // the Fulfillment record a SHIPPED transition creates below, so they're read from the body
    // here but applied there, not folded into detailsPatch.
    const trackingCompany = body.trackingCompany !== undefined ? String(body.trackingCompany || '').trim().slice(0, 120) || null : null
    const trackingUrl = body.trackingUrl !== undefined ? String(body.trackingUrl || '').trim().slice(0, 500) || null : null

    const hasOnlyDetails = Object.keys(detailsPatch).length > 0 && !requestedStatus && !requestedPayment
    const result = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, paymentTransactions: true } })
      if (!order) throw new Error('Order not found')
      if (requestedStatus && !canTransitionOrder(order.status, requestedStatus)) throw new Error(`Cannot change ${order.status} to ${requestedStatus}`)
      if (requestedPayment && !canTransitionPayment(order.paymentStatus, requestedPayment)) throw new Error(`Cannot change payment status ${order.paymentStatus} to ${requestedPayment}`)
      const statusChanged = !!requestedStatus && requestedStatus !== order.status
      const paymentChanged = !!requestedPayment && requestedPayment !== order.paymentStatus
      const cancelling = requestedStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED
      const fulfilling = requestedStatus === OrderStatus.SHIPPED && order.fulfillmentStatus !== 'FULFILLED'
      if (cancelling) await releaseOrderReservations(tx, order.id, 'Order cancelled')
      const fulfilledInventoryIds = fulfilling ? await fulfillOrderStock(tx, order.id) : []

      // Cancelling a PAID (or partially-refunded) order leaves that money out of sync unless
      // it's reversed here -- mirrors how returns/order-edits handle a paid order's total
      // changing, except the whole remaining balance is refunded since the order is void.
      // Gift card / coin / coupon usage is unwound unconditionally on any cancellation (not
      // just paid ones), matching how the customer's own cancel route already restores them.
      let refundToSettle: { refundId: string; refundProvider: string; refundExternalId: string | null; amount: number } | null = null
      let cancelRefundAmount = 0
      let cancelRefundProvider: string | null = null
      if (cancelling) {
        const refundableOrder = order as unknown as ReturnableOrder
        if (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) {
          const refundable = remainingRefundable(refundableOrder)
          if (refundable > 0) {
            const { refundProvider, refundExternalId } = pickRefundSource(refundableOrder)
            const refundStatus = refundProvider === 'manual' || refundProvider === 'wallet' ? 'refunded' : 'refund_pending'
            const refund = await tx.paymentTransaction.create({ data: { orderId: order.id, provider: refundProvider, externalId: refundExternalId, status: refundStatus, amount: refundable, currency: order.currency, rawJson: JSON.stringify({ reason: 'Order cancelled by staff', actorId: actor.id }) } })
            if (refundStatus === 'refunded') {
              cancelRefundAmount = refundable
              cancelRefundProvider = refundProvider
              if (refundProvider === 'wallet') await creditWalletRefund(tx, { userId: order.userId, refundId: refund.id, amount: refundable, currency: order.currency })
            } else {
              refundToSettle = { refundId: refund.id, refundProvider, refundExternalId, amount: refundable }
            }
          }
        }

        const redeemedGift = redeemedGiftCard(order.paymentTransactions)
        if (redeemedGift) await restoreGiftCardBalance(tx, order.id, redeemedGift)

        const coinsUsed = redeemedCancelCoins(order.paymentTransactions)
        if (coinsUsed > 0 && order.userId) {
          const reversalId = `coin_${order.id}_cancel_reversal`
          await tx.coinTransaction.upsert({ where: { id: reversalId }, create: { id: reversalId, userId: order.userId, amount: coinsUsed, type: 'REVERSAL', reason: 'Cancelled order coin restoration', referenceId: `coin-reversal:${order.orderNumber}` }, update: {} })
        }

        if (order.couponCode) {
          const coupon = await tx.coupon.findUnique({ where: { code: order.couponCode } })
          if (coupon) await tx.coupon.updateMany({ where: { id: coupon.id, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
        }
      }

      const data: any = {
        ...detailsPatch,
        ...(statusChanged ? { status: requestedStatus, fulfillmentStatus: fulfillmentForStatus(requestedStatus!) } : {}),
        ...(paymentChanged ? { paymentStatus: requestedPayment } : {}),
        ...(cancelRefundAmount > 0 ? { paymentStatus: PaymentStatus.REFUNDED } : {}),
      }
      const cancelMessage = cancelRefundAmount > 0
        ? ` A ${(cancelRefundAmount / 100).toFixed(2)} ${order.currency} refund was issued${cancelRefundProvider === 'wallet' ? ' to the customer’s wallet' : ''}.`
        : refundToSettle ? ` A ${(refundToSettle.amount / 100).toFixed(2)} ${order.currency} refund is being processed.` : ''
      const updated = await tx.order.update({ where: { id: order.id }, data: { ...data, ...(statusChanged ? { events: { create: { status: requestedStatus!, message: `Order moved from ${order.status} to ${requestedStatus}.${cancelMessage}` } } } : {}) } })
      // Recording a Fulfillment (with one line per order item) is how this "ship the whole
      // order" action leaves a real shipment record behind -- carrier/tracking-URL metadata a
      // customer-facing tracking page or a future partial-shipment flow can read, rather than
      // only ever living in Order.trackingNumber. Scoped to what this single-shipment action
      // already knows: it always covers every item on the order in one shipment.
      let fulfillment: { id: string } | null = null
      if (fulfilling) {
        // fulfillOrderStock (above) already picked which physical InventoryItem rows this
        // shipment's stock actually came out of -- reuse that instead of guessing, so the
        // shipment records which warehouse it must ship from rather than leaving Fulfillment's
        // locationId permanently null. Majority location wins when a line item's stock had to
        // be split across more than one (reserveStock now prefers a single location where
        // possible, so a split only happens when no one location had enough).
        const fulfillmentLocationId = fulfilledInventoryIds.length
          ? pickMajorityLocation(await tx.inventoryItem.findMany({ where: { id: { in: fulfilledInventoryIds } }, select: { locationId: true } }))
          : null
        fulfillment = await tx.fulfillment.create({
          data: {
            orderId: order.id, status: 'SHIPPED', shippedAt: new Date(),
            trackingNumber: (data.trackingNumber ?? order.trackingNumber) || null,
            trackingCompany, trackingUrl, locationId: fulfillmentLocationId,
          },
        })
        for (const item of order.items) {
          await tx.fulfillmentLine.create({ data: { fulfillmentId: fulfillment.id, orderItemId: item.id, productId: item.productId, variantId: item.variantId, quantity: item.quantity } })
        }
      }
      return { order, updated, statusChanged, paymentChanged, hasOnlyDetails, fulfilledInventoryIds, fulfilling, fulfillmentId: fulfillment?.id, refundToSettle, cancelRefundAmount }
    })
    if (result.order.userId && result.statusChanged) {
      const body = result.cancelRefundAmount > 0
        ? `Your order is now cancelled. A ${(result.cancelRefundAmount / 100).toFixed(2)} ${result.updated.currency} refund has been issued.`
        : result.refundToSettle
          ? `Your order is now cancelled. A ${(result.refundToSettle.amount / 100).toFixed(2)} ${result.updated.currency} refund is being processed.`
          : `Your order is now ${result.updated.status.toLowerCase().replaceAll('_', ' ')}.`
      await db.notification.create({ data: { userId: result.order.userId, title: `Order ${result.order.orderNumber} updated`, body, type: result.cancelRefundAmount > 0 || result.refundToSettle ? 'ORDER_REFUND' : 'ORDER_STATUS' } })
    }
    if (result.fulfilling) void sendFulfillmentEmail(result.order.id).catch(error => console.error('[email] fulfillment notification failed', error))
    // A gift-card product added via an order edit that increased the order's total is
    // deliberately never issued at edit-commit time (see app/api/admin/order-edits/[id]/route.ts)
    // since that additional amount is only a pending manual charge with no automatic payment
    // confirmation -- staff marking the order PAID here is that confirmation.
    if (result.paymentChanged && requestedPayment === PaymentStatus.PAID) {
      void issueAndNotifyGiftCardsForOrder(result.order.id).catch(error => console.error('[email] gift card issuance on payment confirmation failed', error))
    }
    await audit(actor.id, 'order.updated', 'Order', result.order.id, { from: result.order.status, to: result.updated.status, paymentFrom: result.order.paymentStatus, paymentTo: result.updated.paymentStatus, statusChanged: result.statusChanged, paymentChanged: result.paymentChanged, detailsEdited: Object.keys(detailsPatch), fulfillmentId: result.fulfillmentId, cancelRefundAmount: result.cancelRefundAmount || undefined, cancelRefundPending: result.refundToSettle?.amount })
    if (result.statusChanged || result.paymentChanged) {
      const eventPayload = { id: result.updated.id, orderNumber: result.updated.orderNumber, status: result.updated.status, paymentStatus: result.updated.paymentStatus, fulfillmentStatus: result.updated.fulfillmentStatus }
      void dispatchWebhookEvent('order.updated', eventPayload).catch(error => console.error('[webhook] order.updated dispatch failed', error))
      if (result.statusChanged && (result.updated.status === OrderStatus.SHIPPED || result.updated.status === OrderStatus.DELIVERED)) {
        void dispatchWebhookEvent('order.fulfilled', eventPayload).catch(error => console.error('[webhook] order.fulfilled dispatch failed', error))
      }
    }
    dispatchInventoryUpdated(result.fulfilledInventoryIds)
    if (result.fulfilledInventoryIds.length) void checkLowStockAlerts(result.fulfilledInventoryIds).catch(error => console.error('[push] low stock alert failed', error))

    if (result.refundToSettle && result.refundToSettle.refundProvider !== 'manual' && result.refundToSettle.refundProvider !== 'wallet') {
      const settled = await settleReturnRefund(actor.id, { orderId: result.updated.id, refundId: result.refundToSettle.refundId, refundProvider: result.refundToSettle.refundProvider, refundExternalId: result.refundToSettle.refundExternalId, amount: result.refundToSettle.amount, currency: result.updated.currency, auditAction: 'order.cancel_refund', keepOrderStatus: true })
      if (!settled.ok) return json({ order: result.updated, error: 'Order cancelled, but the gateway refund failed. The refund remains marked failed for admin retry.' }, { status: 502 })
    }
    const cancelRefund = result.cancelRefundAmount > 0
      ? { amount: result.cancelRefundAmount, pending: false }
      : result.refundToSettle ? { amount: result.refundToSettle.amount, pending: true } : null
    return json({ order: result.updated, cancelRefund })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update order' }, { status: 400 })
  }
}
