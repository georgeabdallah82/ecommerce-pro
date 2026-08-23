import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { canTransitionOrder, canTransitionPayment, fulfillmentForStatus } from '@/lib/orders'
import { fulfillOrderStock, releaseOrderReservations } from '@/lib/inventory'
import { json } from '@/lib/utils'
import { OrderStatus, PaymentStatus } from '@prisma/client'

const ORDER_STATUSES = new Set(Object.values(OrderStatus))
const PAYMENT_STATUSES = new Set(Object.values(PaymentStatus))

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const q = sp.get('q')?.trim()
    if (status && !ORDER_STATUSES.has(status as OrderStatus)) return json({ error: 'Invalid order status' }, { status: 400 })
    const rows = await db.order.findMany({ where: { ...(status ? { status: status as OrderStatus } : {}), ...(q ? { OR: [{ orderNumber: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}) }, include: { user: true, items: true }, orderBy: { createdAt: 'desc' }, take: 200 })
    return json(rows)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json()
    const order = await db.order.findUnique({ where: { id: String(body.id) } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })

    const noteBody = typeof body.addNote === 'string' ? body.addNote.trim() : ''
    if (noteBody) {
      const note = await db.orderNote.create({ data: { orderId: order.id, userId: actor.id, body: noteBody }, include: { user: true } })
      await audit(actor.id, 'order.note_added', 'Order', order.id, { noteId: note.id })
      return json({ note }, { status: 201 })
    }

    const next = typeof body.status === 'string' && body.status ? body.status as OrderStatus : undefined
    const nextPayment = typeof body.paymentStatus === 'string' && body.paymentStatus ? body.paymentStatus as PaymentStatus : undefined
    if (next && !ORDER_STATUSES.has(next)) return json({ error: 'Invalid order status' }, { status: 400 })
    if (nextPayment && !PAYMENT_STATUSES.has(nextPayment)) return json({ error: 'Invalid payment status' }, { status: 400 })
    if (next && !canTransitionOrder(order.status, next)) return json({ error: `Cannot change ${order.status} to ${next}` }, { status: 400 })
    if (nextPayment && !canTransitionPayment(order.paymentStatus, nextPayment)) return json({ error: `Cannot change payment status ${order.paymentStatus} to ${nextPayment}` }, { status: 400 })
    if (nextPayment === 'REFUNDED' || nextPayment === 'PARTIALLY_REFUNDED') return json({ error: 'Use the refund/return workflow to create a refund transaction' }, { status: 400 })

    const updated = await db.$transaction(async tx => {
      if (next === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) await releaseOrderReservations(tx, order.id, 'Order cancelled')
      if (next === OrderStatus.SHIPPED && order.status === OrderStatus.PROCESSING) await fulfillOrderStock(tx, order.id)

      const data: any = {
        ...(next ? { status: next, fulfillmentStatus: fulfillmentForStatus(next) } : {}),
        ...(nextPayment ? { paymentStatus: nextPayment } : {}),
        ...(body.trackingNumber !== undefined ? { trackingNumber: String(body.trackingNumber || '').trim() || null } : {}),
        ...(body.notes !== undefined ? { notes: String(body.notes || '') } : {}),
      }
      return tx.order.update({ where: { id: order.id }, data: { ...data, events: next ? { create: { status: next, message: `Order moved from ${order.status} to ${next}.` } } : undefined } })
    })

    if (order.userId && next && next !== order.status) await db.notification.create({ data: { userId: order.userId, title: `Order ${order.orderNumber} updated`, body: `Your order is now ${next.toLowerCase().replaceAll('_', ' ')}.`, type: 'ORDER_STATUS' } })
    await audit(actor.id, 'order.updated', 'Order', order.id, { from: order.status, to: next || order.status, paymentFrom: order.paymentStatus, paymentTo: nextPayment || order.paymentStatus })
    return json({ order: updated })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update order' }, { status: 400 })
  }
}
