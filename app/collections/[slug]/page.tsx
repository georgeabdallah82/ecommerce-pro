import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { withProductStats } from '@/lib/product-stats'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/footer'
import AliExpressCollectionDetail from '@/components/aliexpress-collection-detail'
import { absoluteUrl, getSiteSeo, isShareableImage, metaText, shareMeta } from '@/lib/seo'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const collection = await db.collection.findUnique({ where: { slug }, select: { name: true, description: true, imageUrl: true } }).catch(() => null)
  if (!collection) return {}
  const seo = await getSiteSeo().catch(() => null)
  const description = metaText(collection.description) || metaText(`Shop ${collection.name} at ${seo?.brand || 'our store'}.`)
  const image = isShareableImage(collection.imageUrl) ? absoluteUrl(collection.imageUrl) : seo?.image
  const url = `/collections/${slug}`
  return { title: collection.name, description, alternates: { canonical: url }, ...shareMeta({ title: collection.name, description, url, image }) }
}

// Shared with /shop (app/shop/page.tsx) -- see that file's own comment on
// theme.editorTemplates.Collection and why these types are excluded.
const COLLECTION_ZONE_EXCLUDE = new Set(['header', 'announcement', 'footer', 'main_collection_banner', 'main_collection_grid'])

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Fetched together; products hidden from the storefront channel are filtered out below.
  const [{ theme }, unpublishedIds, collection] = await Promise.all([getThemeState(), getUnpublishedProductIds(), db.collection.findUnique({
    where: { slug },
    include: {
      products: {
        include: { product: { include: { images: { orderBy: { sortOrder: 'asc' } }, collections: { include: { collection: true } } } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })])
  const sections = (theme.editorTemplates?.Collection || []).filter((s: any) => s && !COLLECTION_ZONE_EXCLUDE.has(s.type))
  const needsCollections = sections.some((s: any) => s.type === 'collection_grid' || s.type === 'collection_carousel')
  if (!collection || !collection.isActive) notFound()
  const hidden = new Set(unpublishedIds)
  // The admin collection editor lets staff attach any product with no status check, so a
  // DRAFT/ARCHIVED product left in a collection (staged "New Arrivals" before going live, or
  // an old seasonal item never removed) must still be filtered out here -- every other
  // storefront listing (homepage, /shop, the product detail page) already excludes non-ACTIVE
  // products; without this, a collection tile links straight to a 404 (or a checkout rejection
  // if it somehow reaches the cart) that those other pages never expose customers to.
  const activeItems = collection.products.filter(x => x.product.status === 'ACTIVE' && !hidden.has(x.productId))
  const [products, zoneCollections] = await Promise.all([
    withProductStats(activeItems.map(x => x.product)),
    needsCollections ? db.collection.findMany({ where: { isActive: true }, take: 12, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([]),
  ])
  return (
    <>
      <AliExpressCollectionDetail theme={theme} collection={collection} products={products} sections={sections} zoneCollections={zoneCollections} />
      <Footer theme={theme} />
    </>
  )
}
