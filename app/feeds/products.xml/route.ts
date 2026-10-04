import { db } from '@/lib/prisma'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStorefrontSettings } from '@/lib/storefront-settings'
import { productFeedXml } from '@/lib/product-feed'

export const dynamic = 'force-dynamic'

// Public catalog feed: paste its address into Meta Commerce Manager (Catalog › Data sources ›
// Data feed › scheduled) and TikTok Catalog Manager. They fetch it on a schedule.
export async function GET(req: Request) {
  try {
    // The address it was reached on, so the links follow the store when its domain changes.
    const url = new URL(req.url).origin
    const [unpublishedIds, store, settings] = await Promise.all([getUnpublishedProductIds(), getStoreIdentity(), getStorefrontSettings()])
    const rows = await db.product.findMany({
      where: { status: 'ACTIVE', giftCard: false, id: { notIn: unpublishedIds } },
      select: {
        id: true, name: true, slug: true, description: true, shortDescription: true, brand: true, vendor: true,
        basePrice: true, compareAtPrice: true, trackInventory: true, continueSellingWhenOutOfStock: true,
        images: { select: { url: true }, orderBy: { sortOrder: 'asc' } },
        ...CARD_STOCK_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    const body = productFeedXml(withCardStock(rows), { name: store.name, url, currency: (settings.get('store.currency') || 'USD').toUpperCase() })
    return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' } })
  } catch (e) {
    console.error('[feed] products feed failed', e)
    return new Response('Feed temporarily unavailable', { status: 503, headers: { 'retry-after': '300' } })
  }
}
