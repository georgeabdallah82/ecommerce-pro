import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { canTransitionOrder, fulfillmentForStatus } from '@/lib/orders'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { ShipmentStatus, OrderStatus } from '@prisma/client'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const b = await req.json()
    const existing = await db.fulfillment.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Fulfillment not found' }, { status: 404 })
    const status = b.status ? String(b.status) as ShipmentStatus : undefined
    if (status && !Object.values(ShipmentStatus).includes(status)) return json({ error: 'Invalid fulfillment status' }, { status: 400 })
    const updated = await db.fulfillment.update({ where: { id }, data: {
      ...(status ? { status } : {}),
      ...(b.trackingNumber !== undefined ? { trackingNumber: b.trackingNumber ? String(b.trackingNumber) : null } : {}),
      ...(b.trackingCompany !== undefined ? { trackingCompany: b.trackingCompany ? String(b.trackingCompany) : null } : {}),
      ...(b.trackingUrl !== undefined ? { trackingUrl: b.trackingUrl ? String(b.trackingUrl) : null } : {}),
      ...(status === ShipmentStatus.SHIPPED && !existing.shippedAt ? { shippedAt: new Date() } : {}),
      ...(status === ShipmentStatus.DELIVERED && !existing.deliveredAt ? { deliveredAt: new Date() } : {}),
    }, include: { lines: true } })
    await audit(actor.id, 'fulfillment.updated', 'Fulfillment', id, { fields: Object.keys(b), status })

    // A Fulfillment is only ever created for the whole order (see app/api/admin/orders/route.ts's
    // SHIPPED-transition handling -- there's no partial-shipment split yet), so delivering it means
    // the order itself is delivered. Without this, marking a shipment delivered here left
    // Order.status stuck on SHIPPED forever: no customer notification, no order.fulfilled webhook,
    // and the order-status dropdown still showing SHIPPED as if nothing happened.
    let orderEvent: { orderId: string; userId: string | null; orderNumber: string } | null = null
    if (status === ShipmentStatus.DELIVERED) {
      orderEvent = await db.$transaction(async tx => {
        const order = await tx.order.findUnique({ where: { id: existing.orderId } })
        if (!order || !canTransitionOrder(order.status, OrderStatus.DELIVERED)) return null
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.DELIVERED,
            fulfillmentStatus: fulfillmentForStatus(OrderStatus.DELIVERED),
            events: { create: { status: OrderStatus.DELIVERED, message: `Shipment ${id} delivered.` } },
          },
        })
        return { orderId: updatedOrder.id, userId: order.userId, orderNumber: updatedOrder.orderNumber }
      })
      if (orderEvent) {
        if (orderEvent.userId) await db.notification.create({ data: { userId: orderEvent.userId, title: `Order ${orderEvent.orderNumber} delivered`, body: `Your order ${orderEvent.orderNumber} has been delivered.`, type: 'ORDER_STATUS' } })
        const eventPayload = { id: orderEvent.orderId, orderNumber: orderEvent.orderNumber, status: OrderStatus.DELIVERED, fulfillmentStatus: fulfillmentForStatus(OrderStatus.DELIVERED) }
        void dispatchWebhookEvent('order.updated', eventPayload).catch(error => console.error('[webhook] order.updated dispatch failed', error))
        void dispatchWebhookEvent('order.fulfilled', eventPayload).catch(error => console.error('[webhook] order.fulfilled dispatch failed', error))
      }
    }

    return json({ fulfillment: updated, order: orderEvent ? { id: orderEvent.orderId, status: OrderStatus.DELIVERED, fulfillmentStatus: fulfillmentForStatus(OrderStatus.DELIVERED) } : undefined })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update fulfillment' }, { status: 400 }) }
}
