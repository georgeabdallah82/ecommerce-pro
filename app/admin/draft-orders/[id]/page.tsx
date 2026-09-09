import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import DraftOrderDetailAdmin from '@/components/draft-order-detail-admin'

export default async function DraftOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('draftOrders.view')
  const { id } = await params
  const draft = await db.draftOrder.findUnique({ where: { id }, include: { items: true } })
  if (!draft) return <div className="empty">Draft order not found.</div>
  return <DraftOrderDetailAdmin initial={JSON.parse(JSON.stringify(draft))} canManage={hasPermission(user.role, 'draftOrders.manage')} />
}
