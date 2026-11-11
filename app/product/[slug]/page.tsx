import { cleanVideoUrl } from '@/lib/product-video'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { getCurrentUser } from '@/lib/auth'
import { getProductStats, withProductStats } from '@/lib/product-stats'
import { CARD_STOCK_INCLUDE, SCHEMA_AVAILABILITY, SHARE_AVAILABILITY, stockLeft, stockState, withCardStock, type StockState } from '@/lib/card-stock'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { getStorefrontSettings } from '@/lib/storefront-settings'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Footer } from '@/components/footer'
import AliExpressProduct from '@/components/aliexpress-product'
import { descriptionHtml } from '@/lib/sanitize-html'
import { absoluteUrl, fromPrice, getSiteSeo, isShareableImage, metaText, productShareText, shareMeta, siteUrl } from '@/lib/seo'
import { validGtin } from '@/lib/product-feed'
import { themeTemplates } from '@/lib/theme-templates'
import { storefrontCached } from '@/lib/storefront-cache'
import { getBoughtTogether } from '@/lib/recommendations'
import { getSellingConfig } from '@/lib/selling-config'
import { dealsForProduct } from '@/lib/quantity-deals-shared'
import { isReviewPhotoUrl } from '@/lib/review-photos'
import { saleFor } from '@/lib/flash-sale'
import { getContactInfo } from '@/lib/store-contact'
import { whatsappDigits } from '@/lib/links'

export const dynamic = 'force-dynamic'
export const revalidate = 0


export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const [product, settings] = await Promise.all([storefrontCached(`product-meta:${slug}`, () => db.product.findUnique({
    where: { slug },
    select: {
      name: true,
      description: true,
      shortDescription: true,
      seoTitle: true,
      seoDescription: true,
      seoImageUrl: true,
      basePrice: true,
      compareAtPrice: true,
      trackInventory: true,
      continueSellingWhenOutOfStock: true,
      preorder: true,
      ...CARD_STOCK_INCLUDE,
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  })), getStorefrontSettings().catch(() => new Map<string, string>())])
  if (!product) return {}
  // Placeholder text like "0" is skipped (lib/seo.ts metaText) so Google and WhatsApp show
  // real copy; SVGs are skipped because share previews can't render them.
  const imageUrl = [product.seoImageUrl, ...product.images.map(i => i.url)].find(isShareableImage)
  const image = imageUrl ? absoluteUrl(imageUrl) : undefined
  const description = metaText(product.seoDescription) || metaText(product.shortDescription) || metaText(product.description)
    || metaText(`Buy ${product.name} online with fast delivery.`)
  const title = product.seoTitle || product.name
  const url = `${siteUrl()}/product/${slug}`
  // A shared link (WhatsApp, Instagram, Facebook) shows the price and stock first; search results keep
  // the plain title and description above.
  const state = stockState({ available: stockLeft(product).product, trackInventory: product.trackInventory, continueSellingWhenOutOfStock: product.continueSellingWhenOutOfStock, preorder: product.preorder })
  const share = productShareText({
    name: title,
    description: metaText(product.seoDescription) || metaText(product.shortDescription) || metaText(product.description),
    cents: fromPrice(product.basePrice, product.variants),
    compareAtCents: product.compareAtPrice,
    currency: settings.get('store.currency')?.trim() || process.env.NEXT_PUBLIC_CURRENCY || 'USD',
    soldOut: state === 'out_of_stock',
    preorder: state === 'preorder',
  })
  return {
    title,
    description,
    alternates: { canonical: url },
    // og:type is written by the page itself as "product" (see ProductShareTags below).
    ...shareMeta({ title: share.title, description: share.description, url, type: null, image: image || (await getSiteSeo().catch(() => null))?.image }),
  }
}

// The product tags Facebook and Instagram read for a shared link or a catalog ad. They need the
// "property" attribute, which Next's own metadata cannot write for these names, so the page renders them
// itself and React moves them into the page head.
function ProductShareTags({ cents, currency, availability }: { cents: number; currency: string; availability: string }) {
  return <>
    <meta property="og:type" content="product" />
    <meta property="product:price:amount" content={(Math.max(0, cents) / 100).toFixed(2)} />
    <meta property="product:price:currency" content={currency} />
    <meta property="product:availability" content={availability} />
  </>
}

// theme.editorTemplates.Product already exists in the theme's stored data
// (lib/theme.ts repairs it to always include a main_product placeholder plus
// sensible defaults like product_recommendations/newsletter) but was never
// read by this page. main_product/header/announcement/footer are excluded
// here since they're either the already-rendered, untouched core above (see
// components/aliexpress-product.tsx) or apply globally, not per-page --
// everything left is genuinely merchant-addable content for this page.
const PRODUCT_ZONE_EXCLUDE = new Set(['header', 'announcement', 'footer', 'main_product'])

function reviewerName(name: string | null | undefined) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Theme, product, the hidden-products list and the signed-in user don't depend on each
  // other, so they're fetched together instead of one after another.
  const [{ theme }, product, unpublishedIds, currentUser] = await Promise.all([getThemeState(), storefrontCached(`product:${slug}`, () => db.product.findUnique({
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
      // Answered questions the owner published (Admin > Questions, lib/product-questions.ts).
      questions: {
        where: { published: true, answer: { not: null } },
        orderBy: { answeredAt: 'desc' },
        take: 20,
        select: { id: true, name: true, question: true, answer: true, answeredAt: true },
      },
    },
  })), getUnpublishedProductIds(), getCurrentUser()])
  const sections = (themeTemplates(theme).Product || []).filter((s: any) => s && !PRODUCT_ZONE_EXCLUDE.has(s.type))

  if (!product || product.status !== 'ACTIVE') return notFound()
  // Same check as isProductPublished(): hidden from the storefront sales channel.
  if (unpublishedIds.includes(product.id)) return notFound()

  const collectionIds = product.collections.map(c => c.collectionId)
  const relatedRaw = collectionIds.length
    ? await storefrontCached(`related:${product.id}:${unpublishedIds.join(',')}`, () => db.product.findMany({
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
      }))
    : []
  // Only queried when the merchant's appended content zone actually contains
  // a collection_grid/collection_carousel section -- the two default sections
  // there (product_recommendations, newsletter) never need it.
  const needsCollections = sections.some((s: any) => s.type === 'collection_grid' || s.type === 'collection_carousel')
  const reviewerIds = [...new Set(product.reviews.map(review => review.userId).filter((id): id is string => !!id))]
  const [related, [ownStats], purchase, existingReview, zoneCollections, reviewerPurchases, boughtTogether] = await Promise.all([
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
    // Which reviewers actually bought this product -- shown as a "Verified purchase" badge.
    reviewerIds.length
      ? db.orderItem.findMany({
          where: { productId: product.id, order: { userId: { in: reviewerIds }, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } },
          select: { order: { select: { userId: true } } },
        }).catch(() => []) as Promise<Array<{ order: { userId: string } | null }>>
      : Promise.resolve([] as Array<{ order: { userId: string } | null }>),
    // "Frequently bought together" (lib/recommendations.ts); the page works without it.
    getBoughtTogether([product.id], 2).catch(error => { console.error('[recommendations] product page', error); return [] }),
  ])
  const verifiedBuyers = new Set(reviewerPurchases.map(item => item.order?.userId).filter(Boolean))
  const reviewEligibility: 'guest' | 'not_purchased' | 'already_reviewed' | 'can_review' = !currentUser
    ? 'guest'
    : existingReview
    ? 'already_reviewed'
    : purchase
    ? 'can_review'
    : 'not_purchased'

  // What each option and the product can still sell (lib/card-stock.ts, the same rule checkout uses).
  const stock = stockLeft(product)
  const variantAvailability = product.variants.map((variant, index) => ({ name: variant.name, sku: variant.sku, available: stock.variants[index]?.available ?? 0 }))
  const productAvailable = stock.product
  const productState = stockState({ available: productAvailable, trackInventory: product.trackInventory, continueSellingWhenOutOfStock: product.continueSellingWhenOutOfStock, preorder: product.preorder })

  const publicProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    descriptionHtml: descriptionHtml(product.description || product.shortDescription),
    // From the settings this request already loaded (getThemeState reads them) -- no extra query.
    returnsEnabled: (await getStorefrontSettings()).get('returns.enabled') !== 'false',
    shortDescription: product.shortDescription,
    sizeGuide: product.sizeGuide,
    brand: product.brand,
    vendor: product.vendor,
    productType: product.productType,
    basePrice: product.basePrice,
    preorder: product.preorder,
    preorderNote: product.preorderNote,
    videoUrl: cleanVideoUrl(product.videoUrl),
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
      // A review from a delivered order's review link (app/review/[orderNumber]) is a purchase.
      verified: !!review.orderId || (!!review.userId && verifiedBuyers.has(review.userId)),
      // First name and last initial only ("Maya H.") -- enough for trust, without a full name.
      // Reviews left without an account carry the name the customer typed instead.
      user: review.user ? { name: reviewerName(review.user.name) } : review.authorName ? { name: reviewerName(review.authorName) } : null,
      photos: (review.photos || []).filter(isReviewPhotoUrl).slice(0, 3),
    })),
    questions: product.questions.map(q => ({ id: q.id, name: reviewerName(q.name), question: q.question, answer: q.answer, answeredAt: q.answeredAt })),
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

  // Search engines get the real prices: one offer per option when options differ in price or
  // stock, otherwise one offer (audit ME-01).
  const storeCurrency = (await getStorefrontSettings()).get('store.currency')?.trim() || process.env.NEXT_PUBLIC_CURRENCY || 'USD'
  const productUrl = `${siteUrl()}/product/${product.slug}`
  const offerFor = (price: number, state: StockState, sku?: string) => ({
    '@type': 'Offer', url: productUrl, priceCurrency: storeCurrency, price: (price / 100).toFixed(2), ...(sku ? { sku } : {}),
    availability: SCHEMA_AVAILABILITY[state], itemCondition: 'https://schema.org/NewCondition',
  })
  // Each option is its own offer: its price, and whether it is in stock, sold out or a pre-order.
  const variantOffers = product.variants.map((variant, index) => offerFor(
    variant.price ?? product.basePrice,
    stockState({ available: variantAvailability[index]?.available ?? 0, trackInventory: product.trackInventory, continueSellingWhenOutOfStock: product.continueSellingWhenOutOfStock, preorder: product.preorder }),
    variant.sku,
  ))
  const variesByOption = variantOffers.length > 1 && new Set(variantOffers.map((o) => `${o.price}|${o.availability}`)).size > 1
  // Breadcrumb trail for Google ("Home > Collection > Product"); the main collection is the first one the product belongs to.
  const mainCollection = product.collections[0]?.collection
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl()}/` },
      ...(mainCollection ? [{ '@type': 'ListItem', position: 2, name: mainCollection.name, item: `${siteUrl()}/collections/${mainCollection.slug}` }] : []),
      { '@type': 'ListItem', position: mainCollection ? 3 : 2, name: product.name, item: `${siteUrl()}/product/${product.slug}` },
    ],
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: metaText(product.description, 5000) || metaText(product.shortDescription, 5000),
    sku: product.sku,
    image: product.images.map((image) => absoluteUrl(image.url)),
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    ...(validGtin(product.barcode) ? { gtin: validGtin(product.barcode) } : {}),
    url: productUrl,
    // Stars in Google search results: the approved reviews' average and a few of them.
    ...(ownStats?.reviewCount ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(ownStats.rating.toFixed(1)), reviewCount: ownStats.reviewCount, bestRating: 5, worstRating: 1 },
      review: product.reviews.slice(0, 5).map((review) => ({
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
        author: { '@type': 'Person', name: reviewerName(review.user?.name || review.authorName) || 'Customer' },
        datePublished: new Date(review.createdAt).toISOString().slice(0, 10),
        ...(review.body ? { reviewBody: metaText(review.body, 1000) } : {}),
      })),
    } : {}),
    offers: variesByOption
      ? variantOffers
      : offerFor(product.variants[0]?.price ?? product.basePrice, productState),
  }

  // Selling tools (lib/selling-config.ts): a flash sale on this product, prices in LBP, and the
  // store's WhatsApp number for "Order on WhatsApp".
  const [selling, contact] = await Promise.all([getSellingConfig().catch(() => null), getContactInfo().catch(() => null)])
  const flash = saleFor(selling?.flashSales, product.id)
  const storeWhatsapp = selling?.whatsappOrder === false ? '' : whatsappDigits(String((theme as any)?.whatsapp?.number || '').trim() || contact?.phone || '', (await getStorefrontSettings()).get('store.country') || 'Lebanon')

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, '\\u003c') }} />
      <ProductShareTags cents={fromPrice(product.basePrice, product.variants)} currency={storeCurrency} availability={SHARE_AVAILABILITY[productState]} />
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
        vapidPublicKey={process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        customerEmail={currentUser?.role === 'CUSTOMER' ? currentUser.email || undefined : undefined}
        boughtTogether={boughtTogether}
        flashSale={flash ? { percent: flash.percent, endsAt: flash.endsAt } : null}
        quantityDeals={dealsForProduct(selling?.quantityDeals || [], product.id)}
        lbpRate={selling?.lbp.show ? selling.lbp.rate : 0}
        storeWhatsapp={storeWhatsapp}
        questionsEnabled={selling?.questions !== false}
        lowStockThreshold={selling?.lowStock || 0}
      />
      <Footer theme={theme} />
    </>
  )
}
