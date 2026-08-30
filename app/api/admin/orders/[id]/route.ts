import { json } from '@/lib/utils'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { fulfillOrderStock, releaseOrderReservations } from '@/lib/inventory'
import { canTransitionOrder, canTransitionPayment } from '@/lib/orders'
import { OrderStatus, PaymentStatus, FulfillmentStatus } from '@prisma/client'

const orderStatuses = new Set(Object.values(OrderStatus))
const paymentStatuses = new Set(Object.values(PaymentStatus))
const fulfillmentStatuses = new Set(Object.values(FulfillmentStatus))

function publicError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'FORBIDDEN') return { error: 'Forbidden', status: 403 }
  if (message === 'UNAUTHORIZED') return { error: 'Unauthorized', status: 401 }
  if (message === 'Order not found') return { error: message, status: 404 }
  if (message.startsWith('Invalid order transition') || message.startsWith('Invalid payment transition')) return { error: message, status: 409 }
  return { error: fallback, status: 500 }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('orders.view')
    const { id } = await params
    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: true,
        events: { orderBy: { createdAt: 'desc' } },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, orderId: true, provider: true, externalId: true, status: true, amount: true, currency: true, createdAt: true },
        },
      },
    })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })
    return json({ order })
  } catch (error) {
    const { error: message, status } = publicError(error, 'Unable to load order')
    return json({ error: message }, { status })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const body = await req.json()
    const requestedStatus = body.status as OrderStatus | undefined
    const requestedPayment = body.paymentStatus as PaymentStatus | undefined
    const requestedFulfillment = body.fulfillmentStatus as FulfillmentStatus | undefined

    if (requestedStatus && !orderStatuses.has(requestedStatus)) return json({ error: 'Invalid order status' }, { status: 400 })
    if (requestedPayment && !paymentStatuses.has(requestedPayment)) return json({ error: 'Invalid payment status' }, { status: 400 })
    if (requestedFulfillment && !fulfillmentStatuses.has(requestedFulfillment)) return json({ error: 'Invalid fulfillment status' }, { status: 400 })
    if (requestedPayment === PaymentStatus.REFUNDED || requestedPayment === PaymentStatus.PARTIALLY_REFUNDED) return json({ error: 'Use the refund/return workflow to create a refund transaction' }, { status: 400 })
    if (requestedFulfillment) return json({ error: 'Fulfillment status is derived from the order workflow and cannot be changed directly' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id } })
      if (!order) throw new Error('Order not found')

      if (requestedStatus && !canTransitionOrder(order.status, requestedStatus)) throw new Error(`Invalid order transition: ${order.status} → ${requestedStatus}`)
      if (requestedPayment && !canTransitionPayment(order.paymentStatus, requestedPayment)) throw new Error(`Invalid payment transition: ${order.paymentStatus} → ${requestedPayment}`)

      const statusChanged = !!requestedStatus && requestedStatus !== order.status
      const paymentChanged = !!requestedPayment && requestedPayment !== order.paymentStatus
      const cancelling = requestedStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED
      const fulfilling = (requestedStatus === OrderStatus.SHIPPED || requestedStatus === OrderStatus.DELIVERED) && order.fulfillmentStatus !== FulfillmentStatus.FULFILLED

      if (cancelling) await releaseOrderReservations(tx, order.id, 'Order cancelled')
      if (fulfilling) await fulfillOrderStock(tx, order.id)

      const nextFulfillment = fulfilling ? FulfillmentStatus.FULFILLED : order.fulfillmentStatus
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          ...(statusChanged ? { status: requestedStatus } : {}),
          ...(statusChanged || fulfilling ? { fulfillmentStatus: nextFulfillment } : {}),
          ...(paymentChanged ? { paymentStatus: requestedPayment } : {}),
          ...(typeof body.trackingNumber === 'string' ? { trackingNumber: body.trackingNumber.trim().slice(0, 120) || null } : {}),
          ...(typeof body.shippingMethod === 'string' ? { shippingMethod: body.shippingMethod.trim().slice(0, 120) || null } : {}),
          ...(statusChanged ? { events: { create: { status: requestedStatus!, message: typeof body.message === 'string' ? body.message.trim().slice(0, 500) : null } } } : {}),
        },
      })
      return { order, updated, statusChanged, paymentChanged }
    })

    if (result.order.userId && result.statusChanged) {
      await db.notification.create({
        data: {
          userId: result.order.userId,
          title: `Order ${result.order.orderNumber} updated`,
          body: `Your order is now ${result.updated.status.toLowerCase().replaceAll('_', ' ')}.`,
          type: 'ORDER_STATUS',
        },
      }).catch(() => undefined)
    }

    await audit(actor.id, 'order.updated', 'Order', result.order.id, {
      from: result.order.status,
      to: result.updated.status,
      paymentFrom: result.order.paymentStatus,
      paymentTo: result.updated.paymentStatus,
      statusChanged: result.statusChanged,
      paymentChanged: result.paymentChanged,
    })

    return json({ order: result.updated })
  } catch (error) {
    const { error: message, status } = publicError(error, 'Unable to update order')
    return json({ error: message }, { status })
  }
}
