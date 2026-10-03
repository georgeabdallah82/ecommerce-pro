import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { getCurrentUser } from '@/lib/auth'
import { getProductStats, withProductStats } from '@/lib/product-stats'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { getStoreCurrency } from '@/lib/store-currency'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Footer } from '@/components/footer'
import AliExpressProduct from '@/components/aliexpress-product'
import { descriptionHtml } from '@/lib/sanitize-html'
import { getReturnsEnabled } from '@/lib/policies'
import { absoluteUrl, getSiteSeo, isShareableImage, metaText, shareMeta, siteUrl } from '@/lib/seo'
import { themeTemplates } from '@/lib/theme-templates'

export const dynamic = 'force-dynamic'
export const revalidate = 0


export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = await db.product.findUnique({
    where: { slug },
    select: {
      name: true,
      description: true,
      shortDescription: true,
      seoTitle: true,
      seoDescription: true,
      seoImageUrl: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  })
  if (!product) return {}
  // Placeholder text like "0" is skipped (lib/seo.ts metaText) so Google and WhatsApp show
  // real copy; SVGs are skipped because share previews can't render them.
  const imageUrl = [product.seoImageUrl, ...product.images.map(i => i.url)].find(isShareableImage)
  const image = imageUrl ? absoluteUrl(imageUrl) : undefined
  const description = metaText(product.seoDescription) || metaText(product.shortDescription) || metaText(product.description)
    || metaText(`Buy ${product.name} online with fast delivery.`)
  const title = product.seoTitle || product.name
  const url = `${siteUrl()}/product/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    ...shareMeta({ title, description, url, image: image || (await getSiteSeo().catch(() => null))?.image }),
  }
}

// theme.editorTemplates.Product already exists in the theme's stored data
// (lib/theme.ts repairs it to always include a main_product placeholder plus
// sensible defaults like product_recommendations/newsletter) but was never
// read by this page. main_product/header/announcement/footer are excluded
// here since they're either the already-rendered, untouched core above (see
// components/aliexpress-product.tsx) or apply globally, not per-page --
// everything left is genuinely merchant-addable content for this page.
const PRODUCT_ZONE_EXCLUDE = new Set(['header', 'announcement', 'footer', 'main_product'])

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Theme, product, the hidden-products list and the signed-in user don't depend on each
  // other, so they're fetched together instead of one after another.
  const [{ theme }, product, unpublishedIds, currentUser] = await Promise.all([getThemeState(), db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { include: { inventory: true } },
      inventory: true,
      reviews: {
        where: { approved: true },
        take: 24,
        orderBy: { featured: 'desc' },
        include: { user: { select: { name: true } } },
      },
      tags: true,
      collections: { include: { collection: true } },
      metafields: { include: { definition: true } },
    },
  }), getUnpublishedProductIds(), getCurrentUser()])
  const sections = (themeTemplates(theme).Product || []).filter((s: any) => s && !PRODUCT_ZONE_EXCLUDE.has(s.type))

  if (!product || product.status !== 'ACTIVE') return notFound()
  // Same check as isProductPublished(): hidden from the storefront sales channel.
  if (unpublishedIds.includes(product.id)) return notFound()

  const collectionIds = product.collections.map(c => c.collectionId)
  const relatedRaw = collectionIds.length
    ? await db.product.findMany({
        where: { status: 'ACTIVE', id: { not: product.id, notIn: unpublishedIds }, collections: { some: { collectionId: { in: collectionIds } } } },
        select: {
          id: true,
          name: true,
          slug: true,
          basePrice: true,
          compareAtPrice: true,
          sku: true,
          featured: true,
          vendor: true,
          trackInventory: true,
          continueSellingWhenOutOfStock: true,
          ...CARD_STOCK_INCLUDE,
          images: {
            select: { id: true, url: true, alt: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
          collections: {
            select: {
              sortOrder: true,
              collection: { select: { id: true, name: true, slug: true, imageUrl: true } },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        take: 24,
      })
    : []
  // Only queried when the merchant's appended content zone actually contains
  // a collection_grid/collection_carousel section -- the two default sections
  // there (product_recommendations, newsletter) never need it.
  const needsCollections = sections.some((s: any) => s.type === 'collection_grid' || s.type === 'collection_carousel')
  const [related, [ownStats], purchase, existingReview, zoneCollections] = await Promise.all([
    withProductStats(withCardStock(relatedRaw)),
    getProductStats([product.id]).then(stats => [stats[product.id]]),
    currentUser
      ? db.orderItem.findFirst({
          where: { productId: product.id, order: { userId: currentUser.id, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } },
          select: { id: true },
        })
      : null,
    currentUser ? db.review.findFirst({ where: { productId: product.id, userId: currentUser.id }, select: { id: true } }) : null,
    needsCollections ? db.collection.findMany({ where: { isActive: true }, take: 12, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([]),
  ])
  const reviewEligibility: 'guest' | 'not_purchased' | 'already_reviewed' | 'can_review' = !currentUser
    ? 'guest'
    : existingReview
    ? 'already_reviewed'
    : purchase
    ? 'can_review'
    : 'not_purchased'

  const sharedRows = product.inventory.filter((inventory) => !inventory.variantId)
  const sharedAvailable = sharedRows.reduce((sum, inventory) => sum + inventory.quantity - inventory.reserved, 0)
  const variantAvailability = product.variants.map((variant) => {
    const dedicated = variant.inventory
    const available = dedicated.length ? dedicated.reduce((sum, inventory) => sum + inventory.quantity - inventory.reserved, 0) : sharedAvailable
    return { name: variant.name, sku: variant.sku, available: Math.max(0, available) }
  })
  const productAvailable = product.variants.length ? Math.max(0, ...variantAvailability.map((variant) => variant.available)) : Math.max(0, sharedAvailable)
  const isAvailable = !product.trackInventory || product.continueSellingWhenOutOfStock || productAvailable > 0

  const publicProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    descriptionHtml: descriptionHtml(product.description || product.shortDescription),
    returnsEnabled: await getReturnsEnabled(),
    shortDescription: product.shortDescription,
    brand: product.brand,
    vendor: product.vendor,
    productType: product.productType,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    rating: ownStats?.rating || 0,
    reviewCount: ownStats?.reviewCount || 0,
    soldCount: ownStats?.soldCount || 0,
    sku: product.sku,
    status: product.status,
    featured: product.featured,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    seoImageUrl: product.seoImageUrl,
    weight: product.weight,
    weightUnit: product.weightUnit,
    requiresShipping: product.requiresShipping,
    taxable: product.taxable,
    giftCard: product.giftCard,
    productTemplate: product.productTemplate,
    publishedAt: product.publishedAt,
    images: product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, sortOrder: image.sortOrder })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      optionJson: variant.optionJson,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      weight: variant.weight,
      weightUnit: variant.weightUnit,
    })),
    reviews: product.reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      createdAt: review.createdAt,
      featured: review.featured,
      user: review.user ? { name: review.user.name } : null,
    })),
    tags: product.tags.map((tag) => ({ id: tag.id, value: tag.value })),
    collections: product.collections.map((item) => ({
      sortOrder: item.sortOrder,
      collection: {
        id: item.collection.id,
        name: item.collection.name,
        slug: item.collection.slug,
        description: item.collection.description,
        imageUrl: item.collection.imageUrl,
      },
    })),
    metafields: product.metafields
      .filter((m) => m.value)
      .map((m) => ({ name: m.definition.name, type: m.definition.type, isList: m.definition.isList, value: m.value })),
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: metaText(product.description, 5000) || metaText(product.shortDescription, 5000),
    sku: product.sku,
    image: product.images.map((image) => absoluteUrl(image.url)),
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    url: `${siteUrl()}/product/${product.slug}`,
    offers: {
      '@type': 'Offer',
      url: `${siteUrl()}/product/${product.slug}`,
      priceCurrency: await getStoreCurrency(),
      price: (product.basePrice / 100).toFixed(2),
      availability: isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <AliExpressProduct
        theme={theme}
        product={publicProduct}
        related={related}
        variantAvailability={variantAvailability}
        productAvailable={productAvailable}
        trackInventory={product.trackInventory}
        continueSellingWhenOutOfStock={product.continueSellingWhenOutOfStock}
        reviewEligibility={reviewEligibility}
        sections={sections}
        collections={zoneCollections}
      />
      <Footer theme={theme} />
    </>
  )
}
