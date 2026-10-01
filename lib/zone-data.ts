import { db } from '@/lib/prisma'
import { withProductStats } from '@/lib/product-stats'
import { getUnpublishedProductIds } from '@/lib/sales-channels'

// Products and collections for pages whose merchant-built sections need them (product
// lists, collection lists, flash deals...). Only call it when a page actually has sections,
// so plain pages cost no extra queries.
export async function loadZoneData() {
  const unpublishedIds = await getUnpublishedProductIds()
  const [rawProducts, collections] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE', id: { notIn: unpublishedIds } }, include: { images: true, collections: { include: { collection: true } } }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 60 }),
    db.collection.findMany({ where: { isActive: true }, include: { products: { select: { productId: true } } }, take: 24, orderBy: { sortOrder: 'asc' } }),
  ])
  return { products: await withProductStats(rawProducts), collections }
}
