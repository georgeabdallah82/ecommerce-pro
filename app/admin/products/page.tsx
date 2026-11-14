import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { productViewCounts, withChannelOptOuts } from '@/lib/product-editor'
import AdminProductsList from '@/components/admin-products-list'

export default async function Products() {
  await requirePermission('products.view')
  const pageSize = 25
  const [counts, rows, channels, optOuts] = await Promise.all([
    // Every view's count, not only the open one's (lib/product-editor.ts).
    productViewCounts(args => db.product.count(args as any)),
    db.product.findMany({
      include: { inventory: true, variants: { include: { inventory: true } }, images: true },
      orderBy: { updatedAt: 'desc' },
      take: pageSize,
    }),
    // The Sales channels column: the active channels, and the products taken off one (normally none).
    db.salesChannel.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
    db.productPublication.findMany({ where: { available: false }, select: { productId: true, channelId: true } }),
  ])
  const total = counts.ALL
  return <AdminProductsList initial={JSON.parse(JSON.stringify({ rows: withChannelOptOuts(rows, optOuts), total, counts, channels, page: 1, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }))} />
}
