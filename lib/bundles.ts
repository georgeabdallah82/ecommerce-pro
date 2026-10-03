// Bundles ("Bundle & save"): a fixed set of products sold together for one price. Off until the
// merchant switches them on (Marketing › Bundles). Kept in one setting row, since a store has a
// handful of bundles at most. Checkout never trusts the cart for the price: it re-reads the
// bundle here and only discounts complete sets of its products at current prices.
import { db } from '@/lib/prisma'

export const BUNDLES_SETTING = 'bundles.config'
export const MAX_BUNDLES = 30
export const MAX_BUNDLE_ITEMS = 6

export type BundleItem = { productId: string; variantId: string | null; quantity: number }
export type BundleRecord = { id: string; name: string; description: string; active: boolean; price: number; items: BundleItem[] }
export type BundleConfig = { enabled: boolean; bundles: BundleRecord[] }

const cleanId = (v: unknown) => String(v ?? '').trim().slice(0, 64)

export function normalizeBundleConfig(raw: unknown): BundleConfig {
  const value = raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  const bundles: BundleRecord[] = []
  for (const b of Array.isArray(value.bundles) ? value.bundles.slice(0, MAX_BUNDLES) : []) {
    if (!b || typeof b !== 'object') continue
    const id = cleanId(b.id)
    const name = String(b.name ?? '').trim().slice(0, 120)
    if (!id || !name) continue
    const items: BundleItem[] = []
    for (const it of Array.isArray(b.items) ? b.items.slice(0, MAX_BUNDLE_ITEMS) : []) {
      const productId = cleanId(it?.productId)
      if (!productId) continue
      const variantId = cleanId(it?.variantId) || null
      if (items.some(x => x.productId === productId && x.variantId === variantId)) continue
      items.push({ productId, variantId, quantity: Math.min(20, Math.max(1, Math.floor(Number(it?.quantity) || 1))) })
    }
    bundles.push({ id, name, description: String(b.description ?? '').trim().slice(0, 300), active: b.active !== false, price: Math.max(0, Math.round(Number(b.price) || 0)), items })
  }
  return { enabled: value.enabled === true, bundles }
}

export async function getBundleConfig(): Promise<BundleConfig> {
  const row = await db.setting.findUnique({ where: { key: BUNDLES_SETTING } })
  if (!row?.value) return { enabled: false, bundles: [] }
  try { return normalizeBundleConfig(JSON.parse(row.value)) } catch { return { enabled: false, bundles: [] } }
}

export async function saveBundleConfig(config: BundleConfig) {
  const value = JSON.stringify(normalizeBundleConfig(config))
  await db.setting.upsert({ where: { key: BUNDLES_SETTING }, update: { value }, create: { key: BUNDLES_SETTING, value } })
}

type PricedProduct = { id: string; name: string; slug: string; sku: string; basePrice: number; status?: string; variants?: Array<{ id: string; name: string; sku: string; price: number | null }>; images?: Array<{ url: string }> }

// Price of one item at the store's current prices, or null when it can no longer be bought.
function itemPrice(item: BundleItem, product: PricedProduct | undefined) {
  if (!product) return null
  if (item.variantId) {
    const variant = product.variants?.find(v => v.id === item.variantId)
    if (!variant) return null
    return { unit: variant.price ?? product.basePrice, name: `${product.name} — ${variant.name}`, sku: variant.sku || product.sku }
  }
  return { unit: product.basePrice, name: product.name, sku: product.sku }
}

// Bundles as the storefront shows them: on, active, every product still for sale, and cheaper
// than buying the items one by one.
export async function publicBundles(unpublishedIds: string[] = []) {
  const config = await getBundleConfig()
  if (!config.enabled) return []
  const active = config.bundles.filter(b => b.active && b.items.length >= 2)
  if (!active.length) return []
  const ids = [...new Set(active.flatMap(b => b.items.map(i => i.productId)))].filter(id => !unpublishedIds.includes(id))
  const products = await db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } } }) as unknown as PricedProduct[]
  const byId = new Map(products.map(p => [p.id, p]))
  const out = []
  for (const b of active) {
    const items = []
    let fullPrice = 0
    for (const item of b.items) {
      const product = byId.get(item.productId)
      const priced = itemPrice(item, product)
      if (!product || !priced) { items.length = 0; break }
      fullPrice += priced.unit * item.quantity
      items.push({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, name: priced.name, sku: priced.sku, price: priced.unit, image: product.images?.[0]?.url || null, slug: product.slug })
    }
    if (items.length !== b.items.length || b.price <= 0 || b.price >= fullPrice) continue
    out.push({ id: b.id, name: b.name, description: b.description, price: b.price, fullPrice, items })
  }
  return out
}

type CartLine = { productId: string; variantId: string | null; quantity: number; bundleId?: string | null }
type NormalizedLine = { productId: string; variantId: string | null; unitPrice: number; taxable: boolean }

// The discount for the bundles in this cart: for each bundle, the number of complete sets its
// lines hold, times (items at current prices − bundle price). Lines without a bundle, extra
// units and incomplete sets pay full price. Returns the taxable / non-taxable split the way
// coupon discounts do, so tax is charged on what the customer actually pays.
export async function bundleDiscount(lines: CartLine[], normalized: NormalizedLine[]) {
  const bundleIds = [...new Set(lines.map(l => l.bundleId).filter(Boolean) as string[])]
  const none = { total: 0, taxable: 0, nonTaxable: 0, applied: [] as Array<{ id: string; name: string; sets: number; discount: number }> }
  if (!bundleIds.length) return none
  const config = await getBundleConfig()
  if (!config.enabled) return none
  const priceOf = (productId: string, variantId: string | null) => normalized.find(n => n.productId === productId && n.variantId === variantId)
  const result = { ...none, applied: [] as typeof none.applied }
  for (const id of bundleIds) {
    const bundle = config.bundles.find(b => b.id === id && b.active)
    if (!bundle || bundle.items.length < 2 || bundle.price <= 0) continue
    let sets = Infinity
    let fullPrice = 0
    let taxablePart = 0
    for (const item of bundle.items) {
      const qty = lines.filter(l => l.bundleId === id && l.productId === item.productId && (l.variantId || null) === item.variantId).reduce((sum, l) => sum + l.quantity, 0)
      sets = Math.min(sets, Math.floor(qty / item.quantity))
      const priced = priceOf(item.productId, item.variantId)
      if (!priced) { sets = 0; break }
      fullPrice += priced.unitPrice * item.quantity
      if (priced.taxable) taxablePart += priced.unitPrice * item.quantity
    }
    if (!Number.isFinite(sets) || sets <= 0 || bundle.price >= fullPrice) continue
    const discount = (fullPrice - bundle.price) * sets
    const taxableShare = fullPrice ? Math.round(discount * taxablePart / fullPrice) : 0
    result.total += discount
    result.taxable += taxableShare
    result.nonTaxable += discount - taxableShare
    result.applied.push({ id, name: bundle.name, sets, discount })
  }
  return result
}
