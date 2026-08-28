import { db } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

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

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

async function findPublicProduct(where: Record<string, unknown>) {
  return db.product.findFirst({ where: { ...where, status: 'ACTIVE' }, select: publicProductSelect })
}

export async function GET(req: Request) {
  try {
    const limit = consumeRateLimit(`products:${clientIp(req)}`, 120, 60 * 1000)
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

    const where = {
      status: 'ACTIVE' as const,
      ...(category ? { category: { slug: category } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { sku: { contains: q } },
              { description: { contains: q } },
              { shortDescription: { contains: q } },
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
