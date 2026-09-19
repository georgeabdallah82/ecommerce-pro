import { db } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { getUnpublishedProductIds } from '@/lib/sales-channels'

const publicProductSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  brand: true,
  vendor: true,
  productType: true,
  basePrice: true,
  compareAtPrice: true,
  sku: true,
  status: true,
  featured: true,
  seoTitle: true,
  seoDescription: true,
  seoImageUrl: true,
  weight: true,
  weightUnit: true,
  requiresShipping: true,
  taxable: true,
  trackInventory: true,
  continueSellingWhenOutOfStock: true,
  giftCard: true,
  productTemplate: true,
  publishedAt: true,
  category: {
    select: { id: true, name: true, slug: true, description: true, imageUrl: true },
  },
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  variants: {
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      optionJson: true,
      price: true,
      compareAtPrice: true,
      weight: true,
      weightUnit: true,
    },
  },
  tags: { select: { id: true, value: true } },
  collections: {
    select: {
      sortOrder: true,
      collection: { select: { id: true, name: true, slug: true, description: true, imageUrl: true } },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const

async function findPublicProduct(where: Record<string, unknown>) {
  const product = await db.product.findFirst({ where: { ...where, status: 'ACTIVE' }, select: publicProductSelect })
  if (!product) return null
  const unpublishedIds = await getUnpublishedProductIds()
  return unpublishedIds.includes(product.id) ? null : product
}

export async function GET(req: Request) {
  try {
    const limit = consumeRateLimit(`products:${clientIp(req.headers)}`, 120, 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many product requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const searchParams = new URL(req.url).searchParams
    const q = searchParams.get('q')?.trim() || ''
    const slug = searchParams.get('slug')?.trim() || ''
    const id = searchParams.get('id')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''

    if (q.length > 100 || slug.length > 180 || id.length > 100 || category.length > 100) {
      return json({ error: 'Invalid product query' }, { status: 400 })
    }

    if (id) {
      const product = await findPublicProduct({ id })
      if (!product) return json({ error: 'Product not found' }, { status: 404 })
      return json(product, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } })
    }

    if (slug) {
      const product = await findPublicProduct({ slug })
      if (!product) return json({ error: 'Product not found' }, { status: 404 })
      return json(product, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } })
    }

    const unpublishedIds = await getUnpublishedProductIds()
    const where = {
      status: 'ACTIVE' as const,
      id: { notIn: unpublishedIds },
      ...(category ? { category: { slug: category } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sku: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
              { shortDescription: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const products = await db.product.findMany({
      where,
      select: publicProductSelect,
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })

    return json(products, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600' } })
  } catch {
    return json({ error: 'Unable to load products' }, { status: 500 })
  }
}
