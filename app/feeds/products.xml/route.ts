import { db } from '@/lib/prisma'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStorefrontSettings } from '@/lib/storefront-settings'
import { feedCategories, productFeedXml } from '@/lib/product-feed'

export const dynamic = 'force-dynamic'

// Public catalog feed: paste its address into Meta Commerce Manager (Catalog › Data sources ›
// Data feed › scheduled) and TikTok Catalog Manager. They fetch it on a schedule.
// The finished feed is kept in Cloudflare's edge cache for 15 minutes (same as cache-control),
// so a repeat fetch -- Meta re-reading it, TikTok, a check -- answers at once without waking the
// database. Nothing warms it on a timer: that would keep the database awake all day.
const FEED_SECONDS = 900

export async function GET(req: Request) {
  const cache: Cache | undefined = (globalThis as any).caches?.default
  const cacheKey = new Request(new URL('/feeds/products.xml', req.url).toString())
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined)
    if (hit) return hit
  }
  try {
    // The address it was reached on, so the links follow the store when its domain changes.
    const url = new URL(req.url).origin
    const [unpublishedIds, store, settings] = await Promise.all([getUnpublishedProductIds(), getStoreIdentity(), getStorefrontSettings()])
    const rows = await db.product.findMany({
      where: { status: 'ACTIVE', giftCard: false, id: { notIn: unpublishedIds } },
      select: {
        id: true, name: true, slug: true, description: true, shortDescription: true, brand: true, vendor: true,
        basePrice: true, compareAtPrice: true, barcode: true, trackInventory: true, continueSellingWhenOutOfStock: true,
        images: { select: { url: true }, orderBy: { sortOrder: 'asc' } },
        collections: { select: { collection: { select: { name: true, isActive: true, sortOrder: true } } } },
        ...CARD_STOCK_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    const products = withCardStock(rows).map(({ collections, ...p }) => ({ ...p, categories: feedCategories(collections) }))
    const body = productFeedXml(products, { name: store.name, url, currency: (settings.get('store.currency') || 'USD').toUpperCase() })
    const response = new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': `public, max-age=${FEED_SECONDS}` } })
    if (cache) await cache.put(cacheKey, response.clone()).catch(() => {})
    return response
  } catch (e) {
    console.error('[feed] products feed failed', e)
    return new Response('Feed temporarily unavailable', { status: 503, headers: { 'retry-after': '300' } })
  }
}
