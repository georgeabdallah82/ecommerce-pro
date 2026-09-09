import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import ReturnsAdmin from '@/components/returns-admin'

export default async function ReturnsPage() {
  const user = await requirePermission('returns.view')
  const rows = await db.returnRequest.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' }, take: 100 })
  const orderIds = Array.from(new Set(rows.map(r => r.orderId)))
  const orders = orderIds.length
    ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, email: true, grandTotal: true, currency: true, status: true, items: { select: { id: true, name: true } } } })
    : []
  const orderById = new Map(orders.map(o => [o.id, o]))
  const initial = rows.map(r => ({ ...r, order: orderById.get(r.orderId) || null }))
  return <ReturnsAdmin initial={JSON.parse(JSON.stringify(initial))} canManage={hasPermission(user.role, 'returns.manage')} />
}
