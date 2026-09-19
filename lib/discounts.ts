import { db } from '@/lib/prisma'

export type LineItem = { productId: string; quantity: number; unitPrice: number; totalPrice: number; taxable: boolean }
export type DiscountSplit = { total: number; taxable: number; nonTaxable: number }

export function zeroSplit(): DiscountSplit { return { total: 0, taxable: 0, nonTaxable: 0 } }

/**
 * Resolves a discount's target scope (the whole cart, a specific product
 * list, or a specific collection list) down to the concrete set of eligible
 * product ids. Collection membership lives on the Collection side of the
 * relation (Collection.products), not Product.collections, so it's resolved
 * with its own lookup rather than assuming the product records already carry
 * their collection ids.
 */
export async function resolveEligibleProductIds(scope: string | undefined, productIds: string[] | undefined, collectionIds: string[] | undefined): Promise<Set<string> | 'ALL'> {
  if (scope === 'SPECIFIC_PRODUCTS') return new Set(productIds || [])
  if (scope === 'SPECIFIC_COLLECTIONS') {
    if (!collectionIds?.length) return new Set()
    const collections = await db.collection.findMany({ where: { id: { in: collectionIds } }, include: { products: { select: { productId: true } } } })
    const ids = new Set<string>()
    for (const collection of collections) for (const link of collection.products) ids.add(link.productId)
    return ids
  }
  return 'ALL'
}

export function eligibleLineItems(items: LineItem[], eligible: Set<string> | 'ALL') {
  return eligible === 'ALL' ? items : items.filter(item => eligible.has(item.productId))
}

/**
 * Buy X, get Y: for every `buyQuantity` eligible units in the cart, `getQuantity`
 * units from the (separately configurable) "get" scope are discounted by
 * `getDiscountPercent` (100 = free). Matches Shopify's own behavior of
 * discounting the cheapest eligible "get" units first, so the customer never
 * ends up with less value than the offer promises regardless of cart order.
 */
export async function buyXGetYDiscount(coupon: any, items: LineItem[]): Promise<DiscountSplit> {
  const buyEligible = await resolveEligibleProductIds(coupon.appliesTo, coupon.productIds, coupon.collectionIds)
  const buyQuantityInCart = eligibleLineItems(items, buyEligible).reduce((sum, item) => sum + item.quantity, 0)
  const buyQuantity = Math.max(1, coupon.buyQuantity || 1)
  const getQuantity = Math.max(1, coupon.getQuantity || 1)
  const timesEarned = Math.floor(buyQuantityInCart / buyQuantity)
  if (timesEarned <= 0) return zeroSplit()

  const getScope = coupon.getAppliesTo || coupon.appliesTo
  const getProductIds = coupon.getProductIds?.length ? coupon.getProductIds : coupon.productIds
  const getCollectionIds = coupon.getCollectionIds?.length ? coupon.getCollectionIds : coupon.collectionIds
  const getEligible = await resolveEligibleProductIds(getScope, getProductIds, getCollectionIds)
  const units = eligibleLineItems(items, getEligible)
    .flatMap(item => Array(item.quantity).fill({ price: item.unitPrice, taxable: item.taxable }))
    .sort((a, b) => a.price - b.price)

  const discountedCount = Math.min(units.length, timesEarned * getQuantity)
  const percent = Math.min(100, Math.max(0, coupon.getDiscountPercent ?? 100))
  return units.slice(0, discountedCount).reduce((split, unit) => {
    const amount = Math.floor(unit.price * percent / 100)
    split.total += amount
    if (unit.taxable) split.taxable += amount
    else split.nonTaxable += amount
    return split
  }, zeroSplit())
}

// Every discount is resolved as a taxable/non-taxable split (not just a total) so checkout can
// apply tax only to the taxable share of the post-discount subtotal -- a coupon that happens to
// land entirely on tax-exempt items must not reduce tax on the taxable items it never touched.
export async function discountAmount(coupon: any, items: LineItem[]): Promise<DiscountSplit> {
  if (coupon.type === 'BUY_X_GET_Y') return buyXGetYDiscount(coupon, items)
  const eligible = await resolveEligibleProductIds(coupon.appliesTo, coupon.productIds, coupon.collectionIds)
  const eligibleItems = eligibleLineItems(items, eligible)
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + item.totalPrice, 0)
  const eligibleTaxableSubtotal = eligibleItems.filter(item => item.taxable).reduce((sum, item) => sum + item.totalPrice, 0)
  if (coupon.type === 'PERCENTAGE') {
    const taxable = Math.floor(eligibleTaxableSubtotal * coupon.value / 100)
    const nonTaxable = Math.floor((eligibleSubtotal - eligibleTaxableSubtotal) * coupon.value / 100)
    return { total: taxable + nonTaxable, taxable, nonTaxable }
  }
  if (coupon.type === 'FIXED') {
    const total = Math.min(eligibleSubtotal, coupon.value)
    const taxable = eligibleSubtotal > 0 ? Math.round(total * eligibleTaxableSubtotal / eligibleSubtotal) : 0
    return { total, taxable, nonTaxable: total - taxable }
  }
  return zeroSplit()
}

export function misconfigured(coupon: { type: string; value: number; buyQuantity: number | null; getQuantity: number | null }) {
  if (coupon.type === 'PERCENTAGE' && (coupon.value < 1 || coupon.value > 100)) return true
  if (coupon.type === 'BUY_X_GET_Y' && (!coupon.buyQuantity || coupon.buyQuantity < 1 || !coupon.getQuantity || coupon.getQuantity < 1)) return true
  return false
}

// Coin redemption isn't scoped to specific items the way a coupon can be, so its reduction is
// prorated across the (already discounted) taxable/non-taxable split by each bucket's remaining
// share -- a customer paying with coins gets the same tax relief they'd get from an equivalent
// cash discount, no more and no less.
export function taxableAmountAfterRewards(taxableSubtotal: number, discountTaxable: number, discountedSubtotal: number, rewardDiscount: number): number {
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - discountTaxable)
  const rewardTaxableShare = discountedSubtotal > 0 ? Math.round(rewardDiscount * taxableAfterDiscount / discountedSubtotal) : 0
  return Math.max(0, taxableAfterDiscount - rewardTaxableShare)
}
