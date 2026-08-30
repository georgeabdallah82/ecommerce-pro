import { db } from '@/lib/prisma'
import { releaseOrderReservations } from '@/lib/inventory'
import { OrderStatus } from '@prisma/client'

const RESERVATION_MINUTES = 30

export async function GET(req: Request) {
  const configured = process.env.CRON_SECRET
  if (!configured || req.headers.get('authorization') !== `Bearer ${configured}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cutoff = new Date(Date.now() - RESERVATION_MINUTES * 60 * 1000)
  const candidates = await db.order.findMany({ where: { status: OrderStatus.PENDING, createdAt: { lt: cutoff } }, select: { id: true, orderNumber: true }, take: 100, orderBy: { createdAt: 'asc' } })

  let released = 0
  for (const candidate of candidates) {
    const didRelease = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: candidate.id }, include: { paymentTransactions: true } })
      if (!order || order.status !== OrderStatus.PENDING || order.createdAt >= cutoff) return false
      const isStorefrontCheckout = order.paymentTransactions.some(t => t.provider === 'checkout')
      if (!isStorefrontCheckout) return false
      const reservation = await tx.inventoryMovement.findFirst({ where: { referenceId: order.orderNumber, type: 'SALE_RESERVATION' } })
      if (!reservation) return false
      await releaseOrderReservations(tx, order.id, 'Expired checkout reservation')
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED, fulfillmentStatus: 'UNFULFILLED', events: { create: { status: OrderStatus.CANCELLED, message: 'Checkout reservation expired.' } } } })
      return true
    })
    if (didRelease) released += 1
  }

  return Response.json({ released, checked: candidates.length })
}
