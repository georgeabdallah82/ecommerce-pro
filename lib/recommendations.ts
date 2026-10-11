import { db } from '@/lib/prisma'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { storefrontCached } from '@/lib/storefront-cache'

// "Frequently bought together" on the product page and "Goes well with your cart" in the cart
// drawer. Ranked by how many orders had both products; when the store has too few orders for
// that, filled with products from the same collections, then the featured and newest ones.
// Only products that can be bought right now are suggested.

// Orders looked at per request: the most recent ones, enough for a small store's pattern.
const RECENT_ORDERS = 300
const UNCOUNTED_STATUSES = ['CANCELLED', 'REFUNDED'] as const

// Product ids, most often bought with `productIds` first. Ties keep the first one seen (newest order).
export function rankBoughtTogether(rows: Array<{ orderId: string; productId: string }>, exclude: Set<string>): string[] {
  const orders = new Map<string, Set<string>>()
  const firstSeen = new Map<string, number>()
  rows.forEach((row, index) => {
    if (exclude.has(row.productId)) return
    const set = orders.get(row.productId) || new Set<string>()
    set.add(row.orderId)
    orders.set(row.productId, set)
    if (!firstSeen.has(row.productId)) firstSeen.set(row.productId, index)
  })
  return [...orders.entries()]
    .sort((a, b) => b[1].size - a[1].size || firstSeen.get(a[0])! - firstSeen.get(b[0])!)
    .map(([id]) => id)
}

// Puts the ranked ids first, then the fallbacks, without repeats, up to `limit`.
export function fillSuggestions(ranked: string[], fallbacks: string[], limit: number): string[] {
  const out: string[] = []
  for (const id of [...ranked, ...fallbacks]) {
    if (out.length >= limit) break
    if (!out.includes(id)) out.push(id)
  }
  return out
}

const CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  basePrice: true,
  compareAtPrice: true,
  trackInventory: true,
  continueSellingWhenOutOfStock: true,
  ...CARD_STOCK_INCLUDE,
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' as const }, take: 1 },
}

async function suggestionIds(productIds: string[], hidden: string[]): Promise<string[]> {
  const exclude = new Set([...productIds, ...hidden])
  const ordered = await db.orderItem.findMany({
    where: { productId: { in: productIds }, order: { status: { notIn: [...UNCOUNTED_STATUSES] } } },
    select: { orderId: true },
    orderBy: { order: { createdAt: 'desc' } },
    take: RECENT_ORDERS,
  })
  const orderIds = [...new Set(ordered.map(row => row.orderId))]
  const together = orderIds.length
    ? await db.orderItem.findMany({ where: { orderId: { in: orderIds }, productId: { notIn: [...exclude] } }, select: { orderId: true, productId: true }, orderBy: { order: { createdAt: 'desc' } } })
    : []
  const ranked = rankBoughtTogether(together, exclude)

  // Fallbacks: the same collections first, then featured and newest.
  const collections = await db.collectionProduct.findMany({ where: { productId: { in: productIds } }, select: { collectionId: true } })
  const collectionIds = [...new Set(collections.map(c => c.collectionId))]
  const [sameCollection, popular] = await Promise.all([
    collectionIds.length
      ? db.product.findMany({ where: { status: 'ACTIVE', giftCard: false, id: { notIn: [...exclude] }, collections: { some: { collectionId: { in: collectionIds } } } }, select: { id: true }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 24 })
      : Promise.resolve([]),
    db.product.findMany({ where: { status: 'ACTIVE', giftCard: false, id: { notIn: [...exclude] } }, select: { id: true }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 24 }),
  ])
  return fillSuggestions(ranked, [...sameCollection, ...popular].map(p => p.id), 24)
}

export type Suggestion = {
  id: string
  name: string
  slug: string
  sku: string
  price: number
  compareAtPrice: number | null
  image: string | null
  // Options that can be bought, with their own price; empty for a product without options.
  options: Array<{ id: string; name: string; sku: string; price: number }>
}

// Up to `limit` products to suggest with these, in order, each one in stock.
export async function getBoughtTogether(productIds: string[], limit = 4): Promise<Suggestion[]> {
  const ids = [...new Set(productIds)].filter(Boolean).sort()
  if (!ids.length) return []
  const hidden = await getUnpublishedProductIds()
  return storefrontCached(`bought-together:${ids.join(',')}:${limit}:${hidden.join(',')}`, async () => {
    const candidates = await suggestionIds(ids, hidden)
    if (!candidates.length) return []
    const products = await db.product.findMany({ where: { id: { in: candidates }, status: 'ACTIVE', giftCard: false }, select: CARD_SELECT })
    const cards = new Map(withCardStock(products).map(p => [p.id, p]))
    const out: Suggestion[] = []
    for (const id of candidates) {
      const card = cards.get(id)
      if (!card || card.soldOut) continue
      const options = card.variants
        .filter(v => v.available === null || v.available > 0)
        .map(v => ({ id: v.id, name: String(v.name || ''), sku: String(v.sku || ''), price: Number(v.price ?? card.basePrice) }))
      out.push({
        id: card.id,
        name: card.name,
        slug: card.slug,
        sku: card.sku,
        price: options[0]?.price ?? card.basePrice,
        compareAtPrice: card.compareAtPrice ?? null,
        image: card.images[0]?.url || null,
        options,
      })
      if (out.length >= limit) break
    }
    return out
  })
}
