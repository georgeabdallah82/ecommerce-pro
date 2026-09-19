import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { getCurrentUser } from '@/lib/auth'
import { getProductStats, withProductStats } from '@/lib/product-stats'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Footer } from '@/components/footer'
import AliExpressProduct from '@/components/aliexpress-product'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

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
  const image = product.seoImageUrl || product.images[0]?.url
  const description = product.seoDescription || product.shortDescription || product.description || undefined
  const title = product.seoTitle || product.name
  const url = `${siteUrl()}/product/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: image ? [image] : undefined, type: 'website' },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { theme } = await getThemeState()
  const product = await db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      category: true,
      variants: { include: { inventory: true } },
      inventory: true,
      reviews: {
        where: { approved: true },
        take: 24,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
      tags: true,
      collections: { include: { collection: true } },
      metafields: { include: { definition: true } },
    },
  })

  if (!product || product.status !== 'ACTIVE') return notFound()

  const relatedRaw = product.category
    ? await db.product.findMany({
        where: { status: 'ACTIVE', categoryId: product.categoryId, id: { not: product.id } },
        select: {
          id: true,
          name: true,
          slug: true,
          basePrice: true,
          compareAtPrice: true,
          sku: true,
          featured: true,
          vendor: true,
          category: { select: { id: true, name: true, slug: true } },
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
  const currentUser = await getCurrentUser()
  const [related, [ownStats], purchase, existingReview] = await Promise.all([
    withProductStats(relatedRaw),
    getProductStats([product.id]).then(stats => [stats[product.id]]),
    currentUser
      ? db.orderItem.findFirst({
          where: { productId: product.id, order: { userId: currentUser.id, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } },
          select: { id: true },
        })
      : null,
    currentUser ? db.review.findFirst({ where: { productId: product.id, userId: currentUser.id }, select: { id: true } }) : null,
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
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
          description: product.category.description,
          imageUrl: product.category.imageUrl,
        }
      : null,
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
      .map((m) => ({ name: m.definition.name, type: m.definition.type, value: m.value })),
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.shortDescription || undefined,
    sku: product.sku,
    image: product.images.map((image) => image.url),
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    url: `${siteUrl()}/product/${product.slug}`,
    offers: {
      '@type': 'Offer',
      url: `${siteUrl()}/product/${product.slug}`,
      priceCurrency: process.env.NEXT_PUBLIC_CURRENCY || 'USD',
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
      />
      <Footer theme={theme} />
    </>
  )
}
