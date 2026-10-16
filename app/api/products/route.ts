import { db } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { withProductStats } from '@/lib/product-stats'
import { searchProductIds } from '@/lib/search-index'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'

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
  createdAt: true,
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
  if (unpublishedIds.includes(product.id)) return null
  const [withStats] = await withProductStats([product])
  return withStats
}

export async function GET(req: Request) {
  try {
    const limit = consumeRateLimit(`products:${clientIp(req.headers)}`, 120, 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many product requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const searchParams = new URL(req.url).searchParams
    const q = searchParams.get('q')?.trim() || ''
    const slug = searchParams.get('slug')?.trim() || ''
    const id = searchParams.get('id')?.trim() || ''
    const collection = searchParams.get('collection')?.trim() || ''
    // ?ids=a,b,c: those products, in that order (the "Recently viewed" row on product pages).
    const ids = (searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(x => x && x.length <= 100).slice(0, 12)

    if (q.length > 100 || slug.length > 180 || id.length > 100 || collection.length > 100) {
      return json({ error: 'Invalid product query' }, { status: 400 })
    }

    if (id) {
      const product = await findPublicProduct({ id })
      if (!product) return json({ error: 'Product not found' }, { status: 404 })
      return json(product, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } })
    }

    if (ids.length) {
      const unpublished = new Set(await getUnpublishedProductIds())
      const rows = await db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { ...publicProductSelect, ...CARD_STOCK_INCLUDE } })
      const byId = new Map(rows.filter(p => !unpublished.has(p.id)).map(p => [p.id, p]))
      const ordered = ids.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
      return json(await withProductStats(withCardStock(ordered)), { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600' } })
    }

    if (slug) {
      const product = await findPublicProduct({ slug })
      if (!product) return json({ error: 'Product not found' }, { status: 404 })
      return json(product, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } })
    }

    const unpublishedIds = await getUnpublishedProductIds()
    // Search forgives typos, Arabic spellings and the store's word list (lib/smart-search.ts).
    const searchIds = q ? await searchProductIds(q, 100) : []
    const where = {
      status: 'ACTIVE' as const,
      id: { notIn: unpublishedIds },
      ...(collection ? { collections: { some: { collection: { slug: collection } } } } : {}),
      ...(q ? { id: { in: searchIds, notIn: unpublishedIds } } : {}),
    }

    const products = await db.product.findMany({
      where,
      select: publicProductSelect,
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })
    const withStats = await withProductStats(q ? [...products].sort((a, b) => searchIds.indexOf(a.id) - searchIds.indexOf(b.id)) : products)

    return json(withStats, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600' } })
  } catch {
    return json({ error: 'Unable to load products' }, { status: 500 })
  }
}
