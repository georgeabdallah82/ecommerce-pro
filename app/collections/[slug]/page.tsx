import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { withProductStats } from '@/lib/product-stats'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/footer'
import AliExpressCollectionDetail from '@/components/aliexpress-collection-detail'
import { absoluteUrl, getSiteSeo, isShareableImage, shareMeta, siteUrl } from '@/lib/seo'
import { collectionListJsonLd, collectionSeo } from '@/lib/collection-seo'
import type { Metadata } from 'next'
import { themeTemplates } from '@/lib/theme-templates'
import { storefrontCached } from '@/lib/storefront-cache'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const collection = await db.collection.findUnique({ where: { slug }, select: { name: true, description: true, imageUrl: true, seoTitle: true, seoDescription: true, isActive: true } }).catch(() => null)
  // An inactive collection is a 404 on the page, so it gets no search or share text either.
  if (!collection || !collection.isActive) return {}
  const seo = await getSiteSeo().catch(() => null)
  // The search title and description the merchant wrote in the collection editor, when there are any.
  const { title, description } = collectionSeo(collection, seo?.brand)
  const image = isShareableImage(collection.imageUrl) ? absoluteUrl(collection.imageUrl) : seo?.image
  const url = `/collections/${slug}`
  return { title, description, alternates: { canonical: url }, ...shareMeta({ title, description, url, image }) }
}

// Shared with /shop (app/shop/page.tsx) -- see that file's own comment on
// theme.editorTemplates.Collection and why these types are excluded.
const COLLECTION_ZONE_EXCLUDE = new Set(['header', 'announcement', 'footer', 'main_collection_banner', 'main_collection_grid'])

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Fetched together; products hidden from the storefront channel are filtered out below.
  const [{ theme }, unpublishedIds, collection] = await Promise.all([getThemeState(), getUnpublishedProductIds(), storefrontCached(`collection:${slug}`, () => db.collection.findUnique({
    where: { slug },
    include: {
      products: {
        include: { product: { include: { images: { orderBy: { sortOrder: 'asc' } }, collections: { include: { collection: true } }, ...CARD_STOCK_INCLUDE } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  }))])
  const sections = (themeTemplates(theme).Collection || []).filter((s: any) => s && !COLLECTION_ZONE_EXCLUDE.has(s.type))
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
    withProductStats(withCardStock(activeItems.map(x => x.product))),
    needsCollections ? db.collection.findMany({ where: { isActive: true }, take: 12, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([]),
  ])
  // The raw collection still carries its full product rows (cost price, barcode); send only
  // the collection's own fields to the client -- products go through withProductStats above.
  const { products: _rows, ...collectionInfo } = collection
  // Breadcrumb trail for Google ("Home > Collection").
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl()}/` },
      { '@type': 'ListItem', position: 2, name: collectionInfo.name, item: `${siteUrl()}/collections/${collectionInfo.slug}` },
    ],
  }
  // The products listed here, for Google as an item list (the search title and description are set in generateMetadata).
  const listing = collectionListJsonLd({
    name: collectionInfo.name,
    slug: collectionInfo.slug,
    base: siteUrl(),
    description: collectionSeo(collectionInfo).description,
    products: products.map(p => ({ name: p.name, slug: p.slug })),
  })
  return (
    <>
      {listing && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(listing).replace(/</g, '\\u003c') }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, '\\u003c') }} />
      <AliExpressCollectionDetail theme={theme} collection={collectionInfo} products={products} sections={sections} zoneCollections={zoneCollections} />
      <Footer theme={theme} />
    </>
  )
}
