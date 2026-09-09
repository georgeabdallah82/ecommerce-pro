import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import InventoryTransferDetail from '@/components/inventory-transfer-detail'

export default async function InventoryTransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('transfers.view')
  const { id } = await params
  const transfer = await db.inventoryTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: true, toLocation: true } })
  if (!transfer) return notFound()
  const productIds = Array.from(new Set(transfer.items.map(i => i.productId)))
  const variantIds = Array.from(new Set(transfer.items.map(i => i.variantId).filter(Boolean))) as string[]
  const [products, variants] = await Promise.all([
    productIds.length ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
    variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
  ])
  const productById = Object.fromEntries(products.map(p => [p.id, p]))
  const variantById = Object.fromEntries(variants.map(v => [v.id, v]))
  const items = transfer.items.map(i => ({ ...i, product: productById[i.productId] || null, variant: i.variantId ? variantById[i.variantId] || null : null }))
  return (
    <InventoryTransferDetail
      initial={JSON.parse(JSON.stringify({ ...transfer, items }))}
      canManage={hasPermission(user.role, 'transfers.manage')}
    />
  )
}
