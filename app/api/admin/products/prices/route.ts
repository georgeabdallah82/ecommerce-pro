import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { getStoreCurrency } from '@/lib/store-currency'
import { money } from '@/lib/config'
import { json } from '@/lib/utils'
import { LAST_PRICE_CHANGE_KEY, PRICE_MODES, changeError, describeChange, previewPrices, type PriceChange, type PriceUndo, type PricedItem } from '@/lib/bulk-prices'

const MAX_ITEMS = 1000
const noStore = { 'Cache-Control': 'private, no-store' }

type Scope = { type?: unknown; id?: unknown; name?: unknown; ids?: unknown }

function readChange(raw: Record<string, unknown> | undefined): PriceChange | null {
  const mode = PRICE_MODES.find(m => m.id === raw?.mode)?.id
  const rounding = raw?.rounding === 'whole' || raw?.rounding === 'ninety-nine' ? raw.rounding : 'none'
  const compareAt = raw?.compareAt === 'same' || raw?.compareAt === 'remove' ? raw.compareAt : 'keep'
  const value = Number(raw?.value)
  return mode ? { mode, value, rounding, compareAt } : null
}

async function itemsFor(scope: Scope): Promise<PricedItem[] | string> {
  const where: Record<string, unknown> = { status: { not: 'ARCHIVED' } }
  if (scope.type === 'collection') where.collections = { some: { collectionId: String(scope.id || '') } }
  else if (scope.type === 'supplier') where.vendor = { equals: String(scope.name || '').trim(), mode: 'insensitive' }
  else if (scope.type === 'products') {
    const ids = Array.isArray(scope.ids) ? scope.ids.map(String).slice(0, MAX_ITEMS) : []
    if (!ids.length) return 'Choose at least one product'
    where.id = { in: ids }
  } else if (scope.type !== 'all') return 'Choose which products to change'
  const products = await db.product.findMany({
    where, take: MAX_ITEMS + 1, orderBy: { name: 'asc' },
    select: { id: true, name: true, basePrice: true, compareAtPrice: true, costPrice: true, variants: { select: { id: true, name: true, price: true, compareAtPrice: true }, orderBy: { name: 'asc' } } },
  })
  if (products.length > MAX_ITEMS) return `That is more than ${MAX_ITEMS} products. Choose a collection or a supplier.`
  const items: PricedItem[] = []
  for (const p of products) {
    items.push({ kind: 'product', id: p.id, productId: p.id, name: p.name, variant: '', price: p.basePrice, compareAt: p.compareAtPrice, cost: p.costPrice })
    for (const v of p.variants) if (v.price != null) items.push({ kind: 'variant', id: v.id, productId: p.id, name: p.name, variant: v.name === 'Default Title' ? '' : v.name, price: v.price, compareAt: v.compareAtPrice, cost: p.costPrice })
  }
  return items
}

// The last change (for Undo), and what the page needs to pick products.
export async function GET() {
  try {
    await requirePermission('products.manage')
    const [last, collections, vendors] = await Promise.all([
      db.setting.findUnique({ where: { key: LAST_PRICE_CHANGE_KEY }, select: { value: true } }),
      db.collection.findMany({ select: { id: true, name: true, _count: { select: { products: true } } }, orderBy: { name: 'asc' } }),
      db.product.groupBy({ by: ['vendor'], where: { status: { not: 'ARCHIVED' }, vendor: { not: null } }, _count: { _all: true } }),
    ])
    let undo: PriceUndo | null = null
    try { undo = last?.value ? JSON.parse(last.value) : null } catch { undo = null }
    return json({
      last: undo ? { at: undo.at, by: undo.by, summary: undo.summary, count: undo.items.length } : null,
      collections: collections.map(c => ({ id: c.id, name: c.name, products: c._count.products })),
      suppliers: vendors.map(v => ({ name: String(v.vendor || '').trim(), products: v._count._all })).filter(v => v.name).sort((a, b) => a.name.localeCompare(b.name)),
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load') }
}

// { scope, change, apply: false } shows the new prices; apply: true saves them.
// { action: 'undo' } puts back the prices from before the last change.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const body = await req.json().catch(() => ({})) as { action?: unknown; scope?: Scope; change?: Record<string, unknown>; apply?: unknown }

    if (body.action === 'undo') {
      const last = await db.setting.findUnique({ where: { key: LAST_PRICE_CHANGE_KEY }, select: { value: true } })
      let undo: PriceUndo | null = null
      try { undo = last?.value ? JSON.parse(last.value) : null } catch { undo = null }
      if (!undo?.items?.length) return json({ error: 'There is no price change to undo' }, { status: 400, headers: noStore })
      // Only prices still at the changed value: one edited by hand since then stays as it is.
      const results = await db.$transaction(undo.items.map(item => item.kind === 'product'
        ? db.product.updateMany({ where: { id: item.id, basePrice: item.newPrice }, data: { basePrice: item.price, compareAtPrice: item.compareAt } })
        : db.productVariant.updateMany({ where: { id: item.id, price: item.newPrice }, data: { price: item.price, compareAtPrice: item.compareAt } })))
      const restored = results.reduce((sum, r) => sum + r.count, 0)
      await db.setting.delete({ where: { key: LAST_PRICE_CHANGE_KEY } }).catch(() => {})
      await audit(actor.id, 'product.prices_undone', 'Product', undefined, { summary: undo.summary, restored, skipped: undo.items.length - restored })
      return json({ restored, skipped: undo.items.length - restored }, { headers: noStore })
    }

    const change = readChange(body.change)
    if (!change) return json({ error: 'Choose how to change the prices' }, { status: 400, headers: noStore })
    const invalid = changeError(change)
    if (invalid) return json({ error: invalid }, { status: 400, headers: noStore })
    const items = await itemsFor(body.scope || {})
    if (typeof items === 'string') return json({ error: items }, { status: 400, headers: noStore })
    if (!items.length) return json({ error: 'No products match' }, { status: 400, headers: noStore })
    const rows = previewPrices(items, change)
    if (body.apply !== true) return json({ rows }, { headers: noStore })

    if (rows.some(r => r.problem)) return json({ error: 'Some new prices would be zero or less. Change the amount first.' }, { status: 400, headers: noStore })
    const changed = rows.filter(r => r.newPrice !== r.price || r.newCompareAt !== r.compareAt)
    if (!changed.length) return json({ error: 'No price changes with these choices' }, { status: 400, headers: noStore })
    await db.$transaction(changed.map(r => r.kind === 'product'
      ? db.product.update({ where: { id: r.id }, data: { basePrice: r.newPrice, compareAtPrice: r.newCompareAt } })
      : db.productVariant.update({ where: { id: r.id }, data: { price: r.newPrice, compareAtPrice: r.newCompareAt } })))
    const currency = await getStoreCurrency()
    const summary = `${describeChange(change, cents => money(cents, currency))}: ${changed.length} price${changed.length === 1 ? '' : 's'}`
    const undo: PriceUndo = { at: new Date().toISOString(), by: actor.name || actor.email, summary, items: changed.map(r => ({ kind: r.kind, id: r.id, price: r.price, compareAt: r.compareAt, newPrice: r.newPrice, newCompareAt: r.newCompareAt })) }
    await db.setting.upsert({ where: { key: LAST_PRICE_CHANGE_KEY }, create: { key: LAST_PRICE_CHANGE_KEY, value: JSON.stringify(undo) }, update: { value: JSON.stringify(undo) } })
    await audit(actor.id, 'product.prices_changed', 'Product', undefined, { summary, scope: body.scope?.type, count: changed.length })
    return json({ changed: changed.length, summary }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to change the prices') }
}
