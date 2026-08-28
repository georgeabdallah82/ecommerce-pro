import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { canCustomerCancel } from '@/lib/orders'
import { releaseOrderReservations } from '@/lib/inventory'
import { json } from '@/lib/utils'

export async function POST(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    const user = await requireUser()
    const { orderNumber } = await params
    const result = await db.$transaction(async tx => {
      const existing = await tx.order.findFirst({ where: { orderNumber, userId: user.id }, select: { id: true } })
      if (!existing) throw new Error('Order not found')

      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${existing.id} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: existing.id } })
      if (!order || order.userId !== user.id) throw new Error('Order not found')
      if (!canCustomerCancel(order.status)) throw new Error('This order can no longer be cancelled online')
      if (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED') throw new Error('Paid orders cannot be cancelled online; use the refund workflow')

      await releaseOrderReservations(tx, order.id, 'Customer cancelled order')

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'UNFULFILLED',
          paymentStatus: order.paymentStatus,
          events: { create: { status: 'CANCELLED', message: 'Order cancelled by customer.' } },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          grandTotal: true,
          currency: true,
        },
      })

      return { updated, userId: order.userId }
    })

    if (result.userId) await db.notification.create({ data: { userId: result.userId, title: `Order ${result.updated.orderNumber} cancelled`, body: 'Your order was cancelled and its inventory reservation was released.', type: 'ORDER_STATUS' } })
    return json({ order: result.updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to cancel order'
    return json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'Order not found' ? 404 : 400 })
  }
}
