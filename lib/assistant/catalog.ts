import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { searchProductIds } from '@/lib/search-index'
import { stockLeft, stockState, type StockState } from '@/lib/card-stock'
import { getProductStats } from '@/lib/product-stats'

// The product facts the assistant may use, always read from the database (never from what Claude
// says): what a search returns, what the cards show, and what is checked before a card is drawn.
// The catalogue is small, so it is read once and shared for 30 seconds like the storefront's other
// data (lib/storefront-cache.ts); only a few matching products ever reach Claude.

export type CatalogProduct = {
  id: string
  name: string
  slug: string
  url: string
  // Cents. The lowest price across the product's options.
  price: number
  compareAtPrice: number | null
  stock: StockState
  image: string | null
  summary: string
  description: string
  brand: string
  type: string
  collections: string[]
  collectionSlugs: string[]
  tags: string[]
  options: string[]
  createdAt: number
}

const stripHtml = (html: string | null | undefined) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

export async function loadCatalog(): Promise<CatalogProduct[]> {
  return storefrontCached('assistant-catalog', async () => {
    const [hidden, rows] = await Promise.all([
      getUnpublishedProductIds(),
      db.product.findMany({
        where: { status: 'ACTIVE', giftCard: false },
        select: {
          id: true, name: true, slug: true, basePrice: true, compareAtPrice: true, shortDescription: true, description: true,
          brand: true, productType: true, trackInventory: true, continueSellingWhenOutOfStock: true, preorder: true, createdAt: true,
          images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: { select: { id: true, name: true, price: true, compareAtPrice: true } },
          inventory: { select: { variantId: true, quantity: true, reserved: true } },
          tags: { select: { value: true } },
          collections: { select: { collection: { select: { name: true, slug: true, isActive: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ])
    const skip = new Set(hidden)
    return rows.filter(p => !skip.has(p.id)).map(p => {
      const left = stockLeft(p)
      const prices = p.variants.map(v => (v.price ?? p.basePrice)).filter(n => Number.isFinite(n))
      const price = prices.length ? Math.min(...prices) : p.basePrice
      const compare = p.variants.length ? Math.max(0, ...p.variants.map(v => Number(v.compareAtPrice ?? p.compareAtPrice ?? 0))) : Number(p.compareAtPrice || 0)
      const description = stripHtml(p.description)
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        url: `/product/${p.slug}`,
        price,
        compareAtPrice: compare > price ? compare : null,
        stock: stockState({ available: left.product, trackInventory: p.trackInventory, continueSellingWhenOutOfStock: p.continueSellingWhenOutOfStock, preorder: p.preorder }),
        image: p.images[0]?.url || null,
        summary: stripHtml(p.shortDescription) || description.slice(0, 160),
        description,
        brand: [p.brand].filter(Boolean).join(' '),
        type: String(p.productType || ''),
        collections: p.collections.filter(c => c.collection.isActive).map(c => c.collection.name),
        collectionSlugs: p.collections.filter(c => c.collection.isActive).map(c => c.collection.slug),
        tags: p.tags.map(t => t.value),
        options: p.variants.map(v => v.name).filter(Boolean).slice(0, 12),
        createdAt: p.createdAt.getTime(),
      }
    })
  })
}

export type ProductQuery = {
  query?: string
  minPrice?: number
  maxPrice?: number
  collection?: string
  inStockOnly?: boolean
  onSale?: boolean
  sort?: 'relevance' | 'price_low' | 'price_high' | 'newest' | 'best_selling'
  limit?: number
}

// A search with filters, by the shop's own search (typos, Arabic spellings, the store's search words).
export async function findProducts(q: ProductQuery): Promise<CatalogProduct[]> {
  const catalog = await loadCatalog()
  const limit = Math.min(Math.max(Number(q.limit) || 6, 1), 8)
  let list: CatalogProduct[]
  const text = String(q.query || '').trim()
  if (text) {
    const ids = await searchProductIds(text, 60)
    const byId = new Map(catalog.map(p => [p.id, p]))
    list = ids.map(id => byId.get(id)).filter((p): p is CatalogProduct => !!p)
  } else {
    list = [...catalog]
  }
  const collection = String(q.collection || '').trim().toLowerCase()
  list = list.filter(p => {
    if (q.minPrice != null && p.price < q.minPrice) return false
    if (q.maxPrice != null && p.price > q.maxPrice) return false
    if (q.inStockOnly && p.stock === 'out_of_stock') return false
    if (q.onSale && !p.compareAtPrice) return false
    if (collection && !p.collectionSlugs.includes(collection) && !p.collections.some(c => c.toLowerCase() === collection)) return false
    return true
  })
  const sort = q.sort || (text ? 'relevance' : 'newest')
  if (sort === 'price_low') list.sort((a, b) => a.price - b.price)
  if (sort === 'price_high') list.sort((a, b) => b.price - a.price)
  if (sort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt)
  if (sort === 'best_selling') {
    const stats = await getProductStats(list.map(p => p.id)).catch(() => ({} as Record<string, { soldCount: number }>))
    list.sort((a, b) => (stats[b.id]?.soldCount || 0) - (stats[a.id]?.soldCount || 0))
  }
  // Sold-out products go after the ones a shopper can buy now.
  list.sort((a, b) => Number(a.stock === 'out_of_stock') - Number(b.stock === 'out_of_stock'))
  return list.slice(0, limit)
}

export async function productById(idOrSlug: string): Promise<CatalogProduct | null> {
  const key = String(idOrSlug || '').trim()
  if (!key) return null
  return (await loadCatalog()).find(p => p.id === key || p.slug === key) || null
}

// Products like this one: sharing collections, type or tags, in a similar price range.
export async function similarProducts(idOrSlug: string, limit = 4): Promise<CatalogProduct[]> {
  const base = await productById(idOrSlug)
  if (!base) return []
  const catalog = await loadCatalog()
  const score = (p: CatalogProduct) => {
    let s = 0
    s += p.collectionSlugs.filter(c => base.collectionSlugs.includes(c)).length * 3
    if (base.type && p.type === base.type) s += 3
    s += p.tags.filter(t => base.tags.includes(t)).length
    const ratio = base.price ? p.price / base.price : 1
    if (ratio > 0.5 && ratio < 2) s += 1
    return s
  }
  return catalog
    .filter(p => p.id !== base.id && p.stock !== 'out_of_stock')
    .map(p => ({ p, s: score(p) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.min(Math.max(limit, 1), 6))
    .map(x => x.p)
}

export async function bestSellers(limit = 6): Promise<CatalogProduct[]> {
  const catalog = (await loadCatalog()).filter(p => p.stock !== 'out_of_stock')
  const stats = await getProductStats(catalog.map(p => p.id)).catch(() => ({} as Record<string, { soldCount: number }>))
  const sold = catalog.filter(p => (stats[p.id]?.soldCount || 0) > 0).sort((a, b) => (stats[b.id]?.soldCount || 0) - (stats[a.id]?.soldCount || 0))
  return sold.slice(0, limit)
}

export async function newArrivals(limit = 6): Promise<CatalogProduct[]> {
  return (await loadCatalog()).filter(p => p.stock !== 'out_of_stock').sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

export async function activeCollections() {
  return storefrontCached('assistant-collections', () => db.collection.findMany({ where: { isActive: true }, select: { name: true, slug: true }, orderBy: { sortOrder: 'asc' }, take: 60 }))
}

// What Claude reads about a product: short, no ids it could misuse beyond picking cards.
export function productForModel(p: CatalogProduct, detail = false) {
  return {
    id: p.id,
    name: p.name,
    price: (p.price / 100).toFixed(2),
    ...(p.compareAtPrice ? { was: (p.compareAtPrice / 100).toFixed(2) } : {}),
    availability: p.stock === 'out_of_stock' ? 'sold out' : p.stock === 'preorder' ? 'pre-order' : 'in stock',
    ...(p.collections.length ? { collections: p.collections.slice(0, 4) } : {}),
    ...(p.type ? { type: p.type } : {}),
    summary: detail ? p.description.slice(0, 700) || p.summary : p.summary.slice(0, 180),
    ...(detail && p.options.length ? { options: p.options } : {}),
    ...(detail && p.brand ? { brand: p.brand } : {}),
  }
}

// What the chat widget shows as a card: only database values.
export type ProductCard = { id: string; name: string; url: string; image: string | null; price: number; compareAtPrice: number | null; stock: StockState; summary: string }
export const toCard = (p: CatalogProduct): ProductCard => ({ id: p.id, name: p.name, url: p.url, image: p.image, price: p.price, compareAtPrice: p.compareAtPrice, stock: p.stock, summary: p.summary.slice(0, 120) })
