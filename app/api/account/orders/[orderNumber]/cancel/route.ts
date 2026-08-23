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

      await releaseOrderReservations(tx, order.id, 'Customer cancelled order')

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'UNFULFILLED',
          // Cancelling does not change whether money was actually paid.
          paymentStatus: order.paymentStatus,
          events: { create: { status: 'CANCELLED', message: 'Order cancelled by customer.' } },
        },
      })
    })

    if (result.userId) await db.notification.create({ data: { userId: result.userId, title: `Order ${result.orderNumber} cancelled`, body: 'Your order was cancelled and its inventory reservation was released.', type: 'ORDER_STATUS' } })
    return json({ order: result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to cancel order'
    return json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'Order not found' ? 404 : 400 })
  }
}
