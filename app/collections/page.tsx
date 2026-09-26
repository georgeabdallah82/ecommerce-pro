import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { Footer } from '@/components/footer'
import AliExpressCollections from '@/components/aliexpress-collections'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Collections() {
  const [{ theme }, unpublishedIds, rawCollections] = await Promise.all([
    getThemeState(),
    getUnpublishedProductIds(),
    db.collection.findMany({
      where: { isActive: true },
      include: { products: { include: { product: { select: { status: true } } } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ])
  const unpublished = new Set(unpublishedIds)
  // The admin collection editor lets staff attach any product with no status check, so a
  // DRAFT/ARCHIVED or unpublished-from-storefront product left in a collection must be
  // excluded from the tile count -- the detail page (app/collections/[slug]/page.tsx)
  // already hides these same items, so the index must not advertise a count it can't show.
  const collections = rawCollections.map(({ products, ...c }) => ({
    ...c,
    _count: { products: products.filter(x => x.product?.status === 'ACTIVE' && !unpublished.has(x.productId)).length },
  }))
  return (
    <>
      <AliExpressCollections collections={collections} />
      <Footer theme={theme} />
    </>
  )
}
