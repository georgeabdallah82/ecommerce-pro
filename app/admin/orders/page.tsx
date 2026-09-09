import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { OrdersAdminShopify } from '@/components/orders-admin-shopify'
import './orders.css'

export default async function Orders() {
  const user = await requirePermission('orders.view')
  const rows = await db.order.findMany({ include: { user: true, items: true }, orderBy: { createdAt: 'desc' }, take: 200 })
  return <OrdersAdminShopify initial={JSON.parse(JSON.stringify(rows))} canRefund={hasPermission(user.role, 'orders.refund')} />
}
