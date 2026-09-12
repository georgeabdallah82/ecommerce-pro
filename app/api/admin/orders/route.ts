import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { canTransitionOrder, canTransitionPayment, fulfillmentForStatus } from '@/lib/orders'
import { fulfillOrderStock, releaseOrderReservations } from '@/lib/inventory'
import { json } from '@/lib/utils'
import { dispatchWebhookEvent, dispatchInventoryUpdated } from '@/lib/webhooks'
import { OrderStatus, PaymentStatus } from '@prisma/client'

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

    const hasOnlyDetails = Object.keys(detailsPatch).length > 0 && !requestedStatus && !requestedPayment
    const result = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order) throw new Error('Order not found')
      if (requestedStatus && !canTransitionOrder(order.status, requestedStatus)) throw new Error(`Cannot change ${order.status} to ${requestedStatus}`)
      if (requestedPayment && !canTransitionPayment(order.paymentStatus, requestedPayment)) throw new Error(`Cannot change payment status ${order.paymentStatus} to ${requestedPayment}`)
      const statusChanged = !!requestedStatus && requestedStatus !== order.status
      const paymentChanged = !!requestedPayment && requestedPayment !== order.paymentStatus
      const cancelling = requestedStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED
      const fulfilling = requestedStatus === OrderStatus.SHIPPED && order.fulfillmentStatus !== 'FULFILLED'
      if (cancelling) await releaseOrderReservations(tx, order.id, 'Order cancelled')
      const fulfilledInventoryIds = fulfilling ? await fulfillOrderStock(tx, order.id) : []
      const data: any = {
        ...detailsPatch,
        ...(statusChanged ? { status: requestedStatus, fulfillmentStatus: fulfillmentForStatus(requestedStatus!) } : {}),
        ...(paymentChanged ? { paymentStatus: requestedPayment } : {}),
      }
      const updated = await tx.order.update({ where: { id: order.id }, data: { ...data, ...(statusChanged ? { events: { create: { status: requestedStatus!, message: `Order moved from ${order.status} to ${requestedStatus}.` } } } : {}) } })
      return { order, updated, statusChanged, paymentChanged, hasOnlyDetails, fulfilledInventoryIds }
    })
    if (result.order.userId && result.statusChanged) await db.notification.create({ data: { userId: result.order.userId, title: `Order ${result.order.orderNumber} updated`, body: `Your order is now ${result.updated.status.toLowerCase().replaceAll('_', ' ')}.`, type: 'ORDER_STATUS' } })
    await audit(actor.id, 'order.updated', 'Order', result.order.id, { from: result.order.status, to: result.updated.status, paymentFrom: result.order.paymentStatus, paymentTo: result.updated.paymentStatus, statusChanged: result.statusChanged, paymentChanged: result.paymentChanged, detailsEdited: Object.keys(detailsPatch) })
    if (result.statusChanged || result.paymentChanged) {
      const eventPayload = { id: result.updated.id, orderNumber: result.updated.orderNumber, status: result.updated.status, paymentStatus: result.updated.paymentStatus, fulfillmentStatus: result.updated.fulfillmentStatus }
      void dispatchWebhookEvent('order.updated', eventPayload).catch(error => console.error('[webhook] order.updated dispatch failed', error))
      if (result.statusChanged && (result.updated.status === OrderStatus.SHIPPED || result.updated.status === OrderStatus.DELIVERED)) {
        void dispatchWebhookEvent('order.fulfilled', eventPayload).catch(error => console.error('[webhook] order.fulfilled dispatch failed', error))
      }
    }
    dispatchInventoryUpdated(result.fulfilledInventoryIds)
    return json({ order: result.updated })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update order' }, { status: 400 })
  }
}
