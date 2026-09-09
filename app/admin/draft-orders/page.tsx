import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import DraftOrdersAdmin from '@/components/draft-orders-admin'

export default async function DraftOrdersPage() {
  const user = await requirePermission('draftOrders.view')
  const rows = await db.draftOrder.findMany({ include: { items: true }, orderBy: { updatedAt: 'desc' }, take: 100 })
  return <DraftOrdersAdmin initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'draftOrders.manage')} />
}
