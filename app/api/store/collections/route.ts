import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { getUnpublishedProductIds } from '@/lib/sales-channels'

// Active collections for the storefront menu ("All categories" and the phone menu): name, link,
// picture (its own, or its first product's) and how many products it shows.
export async function GET() {
  try {
    const [unpublishedIds, rows] = await Promise.all([
      getUnpublishedProductIds(),
      db.collection.findMany({
        where: { isActive: true },
        include: { products: { include: { product: { select: { status: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } } } } } },
        orderBy: { sortOrder: 'asc' },
        take: 60,
      }),
    ])
    const unpublished = new Set(unpublishedIds)
    const collections = rows.map(c => {
      const visible = c.products.filter(x => x.product?.status === 'ACTIVE' && !unpublished.has(x.productId))
      return {
        id: c.id, name: c.name, slug: c.slug,
        imageUrl: c.imageUrl || visible.map(x => (x.product as any)?.images?.[0]?.url).find(Boolean) || null,
        count: visible.length,
      }
    }).filter(c => c.count > 0)
    return json({ collections }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } })
  } catch {
    return json({ collections: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
