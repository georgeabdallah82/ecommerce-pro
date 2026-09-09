import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import OrderEditsList from '@/components/order-edits-list'

export default async function OrderEditsPage() {
  const user = await requirePermission('orderEdits.view')
  const edits = await db.orderEdit.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' }, take: 200 })
  const orderIds = Array.from(new Set(edits.map(e => e.orderId)))
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, currency: true, status: true } }) : []
  const orderById = Object.fromEntries(orders.map(o => [o.id, o]))
  const rows = edits.map(e => ({ ...e, order: orderById[e.orderId] || null }))
  return <OrderEditsList initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'orderEdits.manage')} />
}
