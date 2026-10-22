// Quantity deals (Marketing > Quantity deals): "Buy 2, save 10%" and "3 for $20". The rules that do
// not need the database, shared by checkout, the price summary, the product page, the cart and the
// admin page, so the price a shopper sees is the price they pay. Money is in cents.
//
// A deal covers every product or chosen products. Its tiers say what the customer gets once they
// have that many eligible units in the cart:
//   - percent: that % off all the eligible units ("Buy 2, save 10%");
//   - total:   groups of that many units for one price ("3 for $20"), the cheapest units first;
// and when several tiers are reached the one that saves the most is used (never added together).

export const QUANTITY_DEALS_SETTING = 'quantityDeals.config'
export const MAX_DEALS = 30
export const MAX_TIERS = 4
export const MAX_DEAL_PRODUCTS = 300
export const MIN_TIER_QUANTITY = 2
export const MAX_TIER_QUANTITY = 99
export const MAX_TIER_PERCENT = 90
const MAX_TOTAL_PRICE = 100_000_000
const MAX_UNITS_CHECKED = 2000

export type QuantityTier = { quantity: number; kind: 'percent' | 'total'; value: number }
export type QuantityDeal = { id: string; name: string; active: boolean; scope: 'all' | 'products'; productIds: string[]; tiers: QuantityTier[] }
export type QuantityDealsConfig = { enabled: boolean; deals: QuantityDeal[] }

export type DealLine = { productId: string; quantity: number; unitPrice: number; totalPrice: number; taxable: boolean }
export type DealSplit = { total: number; taxable: number; nonTaxable: number }

const cleanId = (value: unknown) => String(value ?? '').trim().slice(0, 64)

export function normalizeQuantityDeals(raw: unknown): QuantityDealsConfig {
  const value = raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  const deals: QuantityDeal[] = []
  const seen = new Set<string>()
  for (const d of Array.isArray(value.deals) ? value.deals.slice(0, MAX_DEALS) : []) {
    if (!d || typeof d !== 'object') continue
    const id = cleanId(d.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const byQuantity = new Map<number, QuantityTier>()
    for (const t of Array.isArray(d.tiers) ? d.tiers.slice(0, 20) : []) {
      const quantity = Math.floor(Number(t?.quantity))
      if (!(quantity >= MIN_TIER_QUANTITY && quantity <= MAX_TIER_QUANTITY)) continue
      const kind = t?.kind === 'total' ? 'total' : 'percent'
      const amount = Math.round(Number(t?.value))
      if (kind === 'percent' ? !(amount >= 1 && amount <= MAX_TIER_PERCENT) : !(amount >= 1 && amount <= MAX_TOTAL_PRICE)) continue
      byQuantity.set(quantity, { quantity, kind, value: amount })
    }
    const productIds: string[] = [...new Set<string>((Array.isArray(d.productIds) ? d.productIds : []).map(cleanId).filter(Boolean))].slice(0, MAX_DEAL_PRODUCTS)
    deals.push({
      id, name: String(d.name ?? '').trim().slice(0, 120) || 'Quantity deal', active: d.active !== false,
      scope: d.scope === 'products' ? 'products' : 'all', productIds,
      tiers: [...byQuantity.values()].sort((a, b) => a.quantity - b.quantity).slice(0, MAX_TIERS),
    })
  }
  return { enabled: value.enabled === true, deals }
}

// What the owner must fix before the deals can be saved (a plain sentence), or ''.
export function dealsProblem(config: QuantityDealsConfig) {
  for (const deal of config.deals) {
    if (!deal.tiers.length) return `"${deal.name}" needs at least one offer, like "Buy 2, save 10%".`
    if (deal.scope === 'products' && !deal.productIds.length) return `"${deal.name}": choose the products it covers, or switch it to all products.`
  }
  return ''
}

const covers = (deal: QuantityDeal, productId: string) => deal.scope === 'all' || deal.productIds.includes(productId)
export const eligibleLines = <T extends Pick<DealLine, 'productId'>>(deal: QuantityDeal, lines: T[]) => lines.filter(line => covers(deal, line.productId))

function tierSaving(tier: QuantityTier, lines: DealLine[], subtotal: number) {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  if (units < tier.quantity) return 0
  if (tier.kind === 'percent') return Math.floor(subtotal * tier.value / 100)
  // Groups of tier.quantity units for one price, filled with the cheapest units first.
  const prices: number[] = []
  for (const line of [...lines].sort((a, b) => a.unitPrice - b.unitPrice)) {
    for (let i = 0; i < line.quantity && prices.length < MAX_UNITS_CHECKED; i++) prices.push(line.unitPrice)
  }
  let saving = 0
  for (let g = 0; (g + 1) * tier.quantity <= prices.length; g++) {
    const group = prices.slice(g * tier.quantity, (g + 1) * tier.quantity).reduce((sum, p) => sum + p, 0)
    saving += Math.max(0, group - tier.value)
  }
  return saving
}

// What this deal takes off the cart, with the part that was taxable (tax is worked out on the rest).
export function dealDiscount(deal: QuantityDeal, lines: DealLine[]): DealSplit {
  const eligible = eligibleLines(deal, lines)
  const subtotal = eligible.reduce((sum, line) => sum + line.totalPrice, 0)
  if (!(subtotal > 0)) return { total: 0, taxable: 0, nonTaxable: 0 }
  const best = Math.min(subtotal, Math.max(0, ...deal.tiers.map(tier => tierSaving(tier, eligible, subtotal))))
  const taxableSubtotal = eligible.filter(line => line.taxable).reduce((sum, line) => sum + line.totalPrice, 0)
  const taxable = Math.round(best * taxableSubtotal / subtotal)
  return { total: best, taxable, nonTaxable: best - taxable }
}

// The active deal that saves the most on this cart, if any.
export function bestDeal(config: QuantityDealsConfig, lines: DealLine[]): { deal: QuantityDeal; split: DealSplit } | null {
  if (!config.enabled) return null
  let best: { deal: QuantityDeal; split: DealSplit } | null = null
  for (const deal of config.deals) {
    if (!deal.active || !deal.tiers.length) continue
    const split = dealDiscount(deal, lines)
    if (split.total > 0 && (!best || split.total > best.split.total)) best = { deal, split }
  }
  return best
}

// The deals the shopper can see: switched on, with offers, and only the fields the pages need.
export type PublicDeal = Pick<QuantityDeal, 'id' | 'scope' | 'productIds' | 'tiers'>
export function publicDeals(config: QuantityDealsConfig): PublicDeal[] {
  if (!config.enabled) return []
  return config.deals.filter(d => d.active && d.tiers.length).map(d => ({ id: d.id, scope: d.scope, productIds: d.scope === 'products' ? d.productIds : [], tiers: d.tiers }))
}
export const dealsForProduct = (deals: PublicDeal[], productId: string) => deals.filter(d => d.scope === 'all' || d.productIds.includes(productId))

// The next offer a cart is close to: how many more units to add, and what it gives. Null when the
// cart already has the best offer, or nothing in it is covered.
export function nextOffer(deals: PublicDeal[], lines: Array<Pick<DealLine, 'productId' | 'quantity'>>) {
  let best: { more: number; tier: QuantityTier; dealId: string } | null = null
  for (const deal of deals) {
    const units = lines.filter(line => deal.scope === 'all' || deal.productIds.includes(line.productId)).reduce((sum, line) => sum + line.quantity, 0)
    if (units < 1) continue
    const tier = deal.tiers.find(t => t.quantity > units)
    if (!tier) continue
    const more = tier.quantity - units
    if (!best || more < best.more) best = { more, tier, dealId: deal.id }
  }
  return best
}
