import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import OrderEditDetail from '@/components/order-edit-detail'

export default async function OrderEditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('orderEdits.view')
  const { id } = await params
  const edit = await db.orderEdit.findUnique({ where: { id }, include: { items: true } })
  if (!edit) return notFound()
  const order = await db.order.findUnique({ where: { id: edit.orderId }, select: { id: true, orderNumber: true, currency: true, status: true, subtotal: true, grandTotal: true, email: true } })
  const productIds = Array.from(new Set(edit.items.map(i => i.productId)))
  const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : []
  const productById = Object.fromEntries(products.map(p => [p.id, p]))
  return (
    <OrderEditDetail
      initial={JSON.parse(JSON.stringify({ ...edit, order, items: edit.items.map(i => ({ ...i, product: productById[i.productId] || null })) }))}
      canManage={hasPermission(user.role, 'orderEdits.manage')}
    />
  )
}
