import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'

// Real per-product signals for the marketplace-style ProductCard (star
// rating + review count, "X+ sold") -- neither existed as a queryable
// aggregate before; both are derived live from Review/OrderItem rather
// than a counter column. Shoppers who aren't signed in share the result for
// up to 30 seconds (lib/storefront-cache.ts), so a rush of visitors doesn't
// rerun the two grouped queries on every page view.
export type ProductStats = { rating: number; reviewCount: number; soldCount: number }

const EMPTY: ProductStats = { rating: 0, reviewCount: 0, soldCount: 0 }

// Prisma's $extends()-wrapped client (see lib/prisma.ts's Accelerate
// extension) loses groupBy's normally-precise return-type inference for
// these two models -- TS collapses the result to `{}` despite the real
// generated ReviewGroupByArgs/OrderItemGroupByArgs types existing (a
// known limitation of extended-client generics, not a mistake in the
// query itself). The runtime shape is exactly what Prisma's docs
// describe for this by/aggregate combination, so assert it explicitly
// rather than fight the broken inference.
type ReviewGroupRow = { productId: string; _avg: { rating: number | null }; _count: { rating: number } }
type OrderItemGroupRow = { productId: string; _sum: { quantity: number | null } }

export async function getProductStats(productIds: string[]): Promise<Record<string, ProductStats>> {
  const ids = Array.from(new Set(productIds)).filter(Boolean)
  if (!ids.length) return {}
  return storefrontCached(`product-stats:${[...ids].sort().join(',')}`, () => loadProductStats(ids))
}

async function loadProductStats(ids: string[]): Promise<Record<string, ProductStats>> {
  const reviewStats = await db.review.groupBy({ by: ['productId'], where: { productId: { in: ids }, approved: true }, _avg: { rating: true }, _count: { rating: true } }) as unknown as ReviewGroupRow[]
  // Sold = paid for. Cash-on-delivery orders count once delivered (the courier collected the
  // money), including ones delivered before delivery started marking them PAID.
  const soldStats = await db.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ids }, order: { OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'COD', status: 'DELIVERED' }] } }, _sum: { quantity: true } }) as unknown as OrderItemGroupRow[]
  const out: Record<string, ProductStats> = {}
  for (const id of ids) out[id] = { ...EMPTY }
  for (const r of reviewStats) out[r.productId] = { ...out[r.productId], rating: r._avg.rating || 0, reviewCount: r._count.rating }
  for (const s of soldStats) out[s.productId] = { ...out[s.productId], soldCount: s._sum.quantity || 0 }
  return out
}

// Fields that must never reach the browser. Every storefront listing (home, shop, collections,
// cart, wishlist, related products) passes its rows through here into client components,
// whose props are serialized into the page -- so a whole Product row used to publish the
// merchant's cost price and internal channel settings in the page source.
const PRIVATE_PRODUCT_FIELDS = ['costPrice', 'salesChannelsJson', 'barcode'] as const

export function stripPrivateProductFields<T extends object>(product: T): T {
  const copy: any = { ...product }
  for (const field of PRIVATE_PRODUCT_FIELDS) delete copy[field]
  if (Array.isArray(copy.variants)) copy.variants = copy.variants.map((v: any) => { const { costPrice, barcode, ...rest } = v || {}; return rest })
  return copy
}

export function attachProductStats<T extends { id: string }>(products: T[], stats: Record<string, ProductStats>): Array<T & ProductStats> {
  return products.map(p => ({ ...stripPrivateProductFields(p), ...(stats[p.id] || EMPTY) }))
}

export async function withProductStats<T extends { id: string }>(products: T[]): Promise<Array<T & ProductStats>> {
  const stats = await getProductStats(products.map(p => p.id))
  return attachProductStats(products, stats)
}

// How many approved reviews gave each rating, for the summary above a product's reviews
// (components/aliexpress-product.tsx). All of them, not only the 24 the page lists; shared for 30
// seconds like the stats above.
export type RatingCounts = Record<1 | 2 | 3 | 4 | 5, number>
type RatingGroupRow = { rating: number; _count: { rating: number } }

export async function getRatingCounts(productId: string): Promise<RatingCounts> {
  const rows = await storefrontCached(`rating-counts:${productId}`, async () => await db.review.groupBy({ by: ['rating'], where: { productId, approved: true }, _count: { rating: true } }) as unknown as RatingGroupRow[])
  return ratingCountsFrom(rows)
}

export function ratingCountsFrom(rows: RatingGroupRow[]): RatingCounts {
  const out: RatingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const row of rows) {
    const star = Math.min(5, Math.max(1, Math.round(Number(row.rating) || 0))) as keyof RatingCounts
    out[star] += Number(row._count?.rating) || 0
  }
  return out
}
