import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { OrdersAdminPro } from '@/components/admin-orders'
import './orders.css'

export default async function Orders() {
  await requirePermission('orders.view')
  const rows = await db.order.findMany({
    include: { user: true, items: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return <OrdersAdminPro initial={JSON.parse(JSON.stringify(rows))} />
}
