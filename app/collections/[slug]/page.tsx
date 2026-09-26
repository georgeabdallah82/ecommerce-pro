import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { withProductStats } from '@/lib/product-stats'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/footer'
import AliExpressCollectionDetail from '@/components/aliexpress-collection-detail'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { theme } = await getThemeState()
  const unpublishedIds = await getUnpublishedProductIds()
  const collection = await db.collection.findUnique({
    where: { slug },
    include: {
      products: {
        where: unpublishedIds.length ? { productId: { notIn: unpublishedIds } } : undefined,
        include: { product: { include: { images: true, category: true, collections: { include: { collection: true } } } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!collection || !collection.isActive) notFound()
  // The admin collection editor lets staff attach any product with no status check, so a
  // DRAFT/ARCHIVED product left in a collection (staged "New Arrivals" before going live, or
  // an old seasonal item never removed) must still be filtered out here -- every other
  // storefront listing (homepage, /shop, the product detail page) already excludes non-ACTIVE
  // products; without this, a collection tile links straight to a 404 (or a checkout rejection
  // if it somehow reaches the cart) that those other pages never expose customers to.
  const activeItems = collection.products.filter(x => x.product.status === 'ACTIVE')
  const products = await withProductStats(activeItems.map(x => x.product))
  return (
    <>
      <AliExpressCollectionDetail theme={theme} collection={collection} products={products} />
      <Footer theme={theme} />
    </>
  )
}
