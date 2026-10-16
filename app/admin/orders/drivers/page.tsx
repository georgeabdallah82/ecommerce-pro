import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreTimezone } from '@/lib/store-timezone'
import { siteUrl } from '@/lib/seo'
import { toCollect } from '@/lib/delivery-sheet'
import DriversAdmin, { type DriverRow } from '@/components/drivers-admin'

export const dynamic = 'force-dynamic'

// Admin > Orders > Drivers (lib/drivers.ts): each driver's link, what they are carrying, and the
// cash they collected and still have to hand over.
export default async function DriversPage() {
  const user = await requirePermission('orders.view')
  const [drivers, open, delivered30, store, timezone] = await Promise.all([
    db.driver.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] }),
    db.order.findMany({
      where: { driverId: { not: null }, OR: [{ status: 'SHIPPED' }, { status: 'DELIVERED', cashCollected: { gt: 0 }, cashSettledAt: null }] },
      select: { id: true, orderNumber: true, driverId: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, currency: true, cashCollected: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 2000,
    }),
    db.order.groupBy({ by: ['driverId'], where: { driverId: { not: null }, status: 'DELIVERED', updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, _count: { _all: true } }),
    getStoreIdentity(),
    getStoreTimezone(),
  ])
  const site = siteUrl()
  const rows: DriverRow[] = drivers.map(d => {
    const mine = open.filter(o => o.driverId === d.id)
    const out = mine.filter(o => o.status === 'SHIPPED')
    const cash = mine.filter(o => o.status === 'DELIVERED')
    return {
      id: d.id, name: d.name, phone: d.phone || '', active: d.active, link: `${site}/driver/${d.token}`,
      outCount: out.length, outCollect: out.reduce((sum, o) => sum + toCollect(o), 0),
      cash: cash.map(o => ({ id: o.id, orderNumber: o.orderNumber, amount: o.cashCollected || 0, deliveredAt: o.updatedAt.toISOString() })),
      delivered30: delivered30.find(g => g.driverId === d.id)?._count._all || 0,
      currency: mine[0]?.currency || 'USD',
    }
  })
  return <DriversAdmin initial={rows} storeName={store.name} timezone={timezone} canManage={hasPermission(user, 'orders.manage')} />
}
