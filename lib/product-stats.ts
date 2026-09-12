import { db } from '@/lib/prisma'

// Real per-product signals for the marketplace-style ProductCard (star
// rating + review count, "X+ sold") -- neither existed as a queryable
// aggregate before; both are derived live from Review/OrderItem rather
// than a cached counter column, since this catalog is small enough that
// a per-request groupBy is cheap and never goes stale.
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
  const reviewStats = await db.review.groupBy({ by: ['productId'], where: { productId: { in: ids }, approved: true }, _avg: { rating: true }, _count: { rating: true } }) as unknown as ReviewGroupRow[]
  const soldStats = await db.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ids }, order: { paymentStatus: 'PAID' } }, _sum: { quantity: true } }) as unknown as OrderItemGroupRow[]
  const out: Record<string, ProductStats> = {}
  for (const id of ids) out[id] = { ...EMPTY }
  for (const r of reviewStats) out[r.productId] = { ...out[r.productId], rating: r._avg.rating || 0, reviewCount: r._count.rating }
  for (const s of soldStats) out[s.productId] = { ...out[s.productId], soldCount: s._sum.quantity || 0 }
  return out
}

export function attachProductStats<T extends { id: string }>(products: T[], stats: Record<string, ProductStats>): Array<T & ProductStats> {
  return products.map(p => ({ ...p, ...(stats[p.id] || EMPTY) }))
}

export async function withProductStats<T extends { id: string }>(products: T[]): Promise<Array<T & ProductStats>> {
  const stats = await getProductStats(products.map(p => p.id))
  return attachProductStats(products, stats)
}
