import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import PurchaseOrderDetail from '@/components/purchase-order-detail'

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('purchaseOrders.view')
  const { id } = await params
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: { items: true, location: true } })
  if (!po) return notFound()
  const productIds = Array.from(new Set(po.items.map(i => i.productId)))
  const variantIds = Array.from(new Set(po.items.map(i => i.variantId).filter(Boolean))) as string[]
  const [products, variants] = await Promise.all([
    productIds.length ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
    variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
  ])
  const productById = Object.fromEntries(products.map(p => [p.id, p]))
  const variantById = Object.fromEntries(variants.map(v => [v.id, v]))
  const items = po.items.map(i => ({ ...i, product: productById[i.productId] || null, variant: i.variantId ? variantById[i.variantId] || null : null }))
  return (
    <PurchaseOrderDetail
      initial={JSON.parse(JSON.stringify({ ...po, items }))}
      canManage={hasPermission(user.role, 'purchaseOrders.manage')}
    />
  )
}
