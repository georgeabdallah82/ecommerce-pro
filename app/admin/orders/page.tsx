import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreIdentity } from '@/lib/store-identity'
import { OrdersAdminShopify } from '@/components/orders-admin-shopify'
import { orderCounts } from '@/lib/order-counts'

export default async function Orders() {
  const user = await requirePermission('orders.view')
  const pageSize = 50
  const [total, rows, storeTimezone, store, counts, unfinishedCount] = await Promise.all([
    db.order.count(),
    db.order.findMany({ include: { user: true, items: true }, orderBy: { createdAt: 'desc' }, take: pageSize }),
    getStoreTimezone(),
    getStoreIdentity(),
    orderCounts().catch(() => ({})),
    // Unfinished checkouts to follow up (app/admin/orders/unfinished): last 14 days, not yet messaged.
    db.abandonedCheckout.count({ where: { status: 'OPEN', whatsappAt: null, lastActivity: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, OR: [{ phone: { not: null } }, { email: { not: null } }] } }).catch(() => 0),
  ])
  const initial = { rows, total, page: 1, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), counts }
  return <OrdersAdminShopify initial={JSON.parse(JSON.stringify(initial))} canRefund={hasPermission(user, 'orders.refund')} storeTimezone={storeTimezone} storeName={store.name} unfinishedCount={unfinishedCount} storeCountry={store.country} />
}
