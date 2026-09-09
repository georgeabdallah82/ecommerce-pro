import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import PurchaseOrdersList from '@/components/purchase-orders-list'

export default async function PurchaseOrdersPage() {
  const user = await requirePermission('purchaseOrders.view')
  const rows = await db.purchaseOrder.findMany({ include: { items: true, location: true }, orderBy: { createdAt: 'desc' }, take: 200 })
  return <PurchaseOrdersList initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'purchaseOrders.manage')} />
}
