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
  const products = await withProductStats(collection.products.map(x => x.product))
  return (
    <>
      <AliExpressCollectionDetail theme={theme} collection={collection} products={products} />
      <Footer theme={theme} />
    </>
  )
}
