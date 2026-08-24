import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ProductListAdmin from '@/components/product-list-admin'

export default async function Products() {
  await requirePermission('products.view')
  const pageSize = 25
  const [total, rows] = await Promise.all([
    db.product.count(),
    db.product.findMany({
      include: { category: true, inventory: true, variants: { include: { inventory: true } }, images: true },
      orderBy: { updatedAt: 'desc' },
      take: pageSize,
    }),
  ])
  return <ProductListAdmin initial={JSON.parse(JSON.stringify({ rows, total, page: 1, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }))} />
}
