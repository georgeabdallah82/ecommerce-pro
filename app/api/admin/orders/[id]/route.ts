import { json } from '@/lib/utils'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { fulfillOrderStock, releaseOrderReservations } from '@/lib/inventory'
import { OrderStatus, PaymentStatus, FulfillmentStatus } from '@prisma/client'

const orderStatuses = new Set(Object.values(OrderStatus))
const paymentStatuses = new Set(Object.values(PaymentStatus))
const fulfillmentStatuses = new Set(Object.values(FulfillmentStatus))

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('orders.view')
    const { id } = await params
    const order = await db.order.findUnique({ where: { id }, include: { items: true, events: { orderBy: { createdAt: 'desc' } }, paymentTransactions: { orderBy: { createdAt: 'desc' } } } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })
    return json({ order })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load order'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 401 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const body = await req.json()
    const order = await db.order.findUnique({ where: { id } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })

    const status = body.status as OrderStatus | undefined
    const paymentStatus = body.paymentStatus as PaymentStatus | undefined
    const fulfillmentStatus = body.fulfillmentStatus as FulfillmentStatus | undefined
    if (status && !orderStatuses.has(status)) return json({ error: 'Invalid order status' }, { status: 400 })
    if (paymentStatus && !paymentStatuses.has(paymentStatus)) return json({ error: 'Invalid payment status' }, { status: 400 })
    if (fulfillmentStatus && !fulfillmentStatuses.has(fulfillmentStatus)) return json({ error: 'Invalid fulfillment status' }, { status: 400 })

    const nextStatus = status ?? order.status
    const cancelling = nextStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED
    const fulfilling = [OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(nextStatus) && order.fulfillmentStatus !== FulfillmentStatus.FULFILLED

    const updated = await db.$transaction(async tx => {
      if (cancelling) await releaseOrderReservations(tx, order.id, 'Order cancelled')
      if (fulfilling) await fulfillOrderStock(tx, order.id)

      const nextPayment = paymentStatus ?? (nextStatus === OrderStatus.CANCELLED ? PaymentStatus.FAILED : order.paymentStatus)
      const nextFulfillment = fulfillmentStatus ?? (fulfilling ? FulfillmentStatus.FULFILLED : order.fulfillmentStatus)
      return tx.order.update({
        where: { id: order.id },
        data: {
          ...(status ? { status } : {}),
          paymentStatus: nextPayment,
          fulfillmentStatus: nextFulfillment,
          ...(typeof body.trackingNumber === 'string' ? { trackingNumber: body.trackingNumber.trim().slice(0, 120) || null } : {}),
          ...(typeof body.shippingMethod === 'string' ? { shippingMethod: body.shippingMethod.trim().slice(0, 120) || null } : {}),
          events: status && status !== order.status ? { create: { status, message: typeof body.message === 'string' ? body.message.trim().slice(0, 500) : null } } : undefined,
        },
      })
    })

    await audit(actor.id, 'order.updated', 'Order', order.id, { status, paymentStatus, fulfillmentStatus, cancelling, fulfilling })
    return json({ order: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update order'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
