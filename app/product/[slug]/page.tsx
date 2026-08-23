import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Footer } from '@/components/footer'
import StorefrontSections from '@/components/storefront-sections'
import ProductAvailabilityGuard from '@/components/product-availability-guard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = await db.product.findUnique({ where: { slug }, select: { name: true, description: true, shortDescription: true, seoTitle: true, seoDescription: true, seoImageUrl: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } })
  if (!product) return {}
  return {
    title: product.seoTitle || product.name,
    description: product.seoDescription || product.shortDescription || product.description || undefined,
    alternates: { canonical: `${siteUrl()}/product/${slug}` },
    openGraph: {
      title: product.seoTitle || product.name,
      description: product.seoDescription || product.shortDescription || product.description || undefined,
      url: `${siteUrl()}/product/${slug}`,
      images: product.seoImageUrl || product.images[0]?.url ? [product.seoImageUrl || product.images[0].url] : undefined,
      type: 'website',
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { theme } = await getThemeState()
  const product = await db.product.findUnique({ where: { slug }, include: { images: { orderBy: { sortOrder: 'asc' } }, category: true, variants: { include: { inventory: true } }, inventory: true, reviews: { where: { approved: true }, take: 24, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } }, collections: { include: { collection: true } } } })
  if (!product || product.status !== 'ACTIVE') return notFound()
  const related = product.category ? await db.product.findMany({ where: { status: 'ACTIVE', categoryId: product.categoryId, id: { not: product.id } }, include: { images: true, category: true, collections: { include: { collection: true } } }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 24 }) : []
  const templates = Array.isArray(theme.editorTemplates?.Product) && theme.editorTemplates.Product.length ? theme.editorTemplates.Product : [{ id: 'announcement', type: 'announcement', enabled: true, settings: { text: 'Free shipping on orders over $50', background: 'primary' } }, { id: 'main_product', type: 'main_product', enabled: true, settings: {} }, { id: 'product_recommendations', type: 'product_recommendations', enabled: true, settings: { heading: 'You may also like', limit: 4, columns: 4 } }, { id: 'newsletter', type: 'newsletter', enabled: true, settings: {} }, { id: 'footer', type: 'footer', enabled: true, settings: {} }]
  const footerEnabled = templates.some((s: any) => s.type === 'footer' && s.enabled !== false && s.settings?.enabled !== false)

  const sharedRows = product.inventory.filter(i => !i.variantId)
  const sharedAvailable = sharedRows.reduce((sum, i) => sum + i.quantity - i.reserved, 0)
  const variantAvailability = product.variants.map(v => {
    const dedicated = v.inventory
    const available = dedicated.length ? dedicated.reduce((sum, i) => sum + i.quantity - i.reserved, 0) : sharedAvailable
    return { name: v.name, sku: v.sku, available: Math.max(0, available) }
  })
  const productAvailable = product.variants.length ? Math.max(0, Math.max(...variantAvailability.map(v => v.available), 0)) : Math.max(0, sharedAvailable)
  const isAvailable = !product.trackInventory || product.continueSellingWhenOutOfStock || productAvailable > 0

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.shortDescription || undefined,
    sku: product.sku,
    image: product.images.map(i => i.url),
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

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <StorefrontSections theme={theme} sections={templates} products={related} collections={[]} product={product}/>
    <ProductAvailabilityGuard variants={variantAvailability} productAvailable={productAvailable} trackInventory={product.trackInventory} continueSellingWhenOutOfStock={product.continueSellingWhenOutOfStock} />
    {footerEnabled && <Footer/>}
  </>
}
