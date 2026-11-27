import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { toCollect } from '@/lib/delivery-sheet'

const noStore = { 'Cache-Control': 'private, no-store' }

// The drivers for the Android admin app: the same figures as Admin > Orders > Drivers
// (app/admin/orders/drivers/page.tsx): what each is carrying, the cash they still have to hand
// over, and their deliveries in the last 30 days. Changes go through /api/admin/drivers*.
// The driver's private link is not sent: it is shared from the web admin.
export async function GET() {
  try {
    const user = await requirePermission('orders.view')
    const [drivers, open, delivered30] = await Promise.all([
      db.driver.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'asc' }], select: { id: true, name: true, phone: true, active: true } }),
      db.order.findMany({
        where: { driverId: { not: null }, OR: [{ status: 'SHIPPED' }, { status: 'DELIVERED', cashCollected: { gt: 0 }, cashSettledAt: null }] },
        select: { id: true, orderNumber: true, driverId: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, currency: true, cashCollected: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
        take: 2000,
      }),
      db.order.groupBy({ by: ['driverId'], where: { driverId: { not: null }, status: 'DELIVERED', updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, _count: { _all: true } }),
    ])
    return json({
      canManage: hasPermission(user, 'orders.manage'),
      drivers: drivers.map(d => {
        const mine = open.filter(o => o.driverId === d.id)
        const out = mine.filter(o => o.status === 'SHIPPED')
        const cash = mine.filter(o => o.status === 'DELIVERED')
        return {
          id: d.id, name: d.name, phone: d.phone || '', active: d.active,
          currency: mine[0]?.currency || 'USD',
          out: out.map(o => ({ id: o.id, orderNumber: o.orderNumber, toCollect: toCollect(o) })),
          outCollect: out.reduce((sum, o) => sum + toCollect(o), 0),
          cash: cash.map(o => ({ id: o.id, orderNumber: o.orderNumber, amount: o.cashCollected || 0, deliveredAt: o.updatedAt })),
          cashTotal: cash.reduce((sum, o) => sum + (o.cashCollected || 0), 0),
          delivered30: delivered30.find(g => g.driverId === d.id)?._count._all || 0,
        }
      }),
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load drivers', 400, noStore) }
}
