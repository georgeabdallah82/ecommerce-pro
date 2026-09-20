import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { OrdersAdminShopify } from '@/components/orders-admin-shopify'

export default async function Orders() {
  const user = await requirePermission('orders.view')
  const pageSize = 50
  const [total, rows, storeTimezone] = await Promise.all([
    db.order.count(),
    db.order.findMany({ include: { user: true, items: true }, orderBy: { createdAt: 'desc' }, take: pageSize }),
    getStoreTimezone(),
  ])
  const initial = { rows, total, page: 1, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
  return <OrdersAdminShopify initial={JSON.parse(JSON.stringify(initial))} canRefund={hasPermission(user.role, 'orders.refund')} storeTimezone={storeTimezone} />
}
