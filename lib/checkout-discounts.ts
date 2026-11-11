import { db } from '@/lib/prisma'
import { discountAmount, misconfigured, zeroSplit, type DiscountSplit, type LineItem } from '@/lib/discounts'
import { inviteCoupon } from '@/lib/invites'
import { getQuantityDeals } from '@/lib/quantity-deals'
import { bestDeal } from '@/lib/quantity-deals-shared'
import { userError } from '@/lib/user-error'

// The discount a cart gets at checkout: a code the customer typed, or else the best automatic
// discount. Shared by checkout (app/api/checkout/route.ts) and the order summary's live price
// (app/api/checkout/quote/route.ts), so both always agree.

export async function applyCoupon(code: string, subtotal: number, items: LineItem[]) {
  if (!code) return { discount: zeroSplit(), coupon: null as any }
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } })
  if (!coupon) {
    // A customer's invite code (lib/invites.ts): the friend's first-order discount. Checkout and
    // the price summary then check it is a new customer (checkInvite).
    const invite = await inviteCoupon(code)
    if (invite) {
      const discount = await discountAmount(invite, items)
      if (discount.total === 0) throw userError('This discount does not apply to the items in your cart')
      return { discount, coupon: invite as any }
    }
  }
  const now = new Date()
  if (!coupon || !coupon.isActive) throw userError('Invalid coupon code')
  if (misconfigured(coupon)) throw userError('This discount is not configured correctly')
  if (coupon.startsAt && coupon.startsAt > now) throw userError('This coupon is not active yet')
  if (coupon.expiresAt && coupon.expiresAt < now) throw userError('This coupon has expired')
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw userError('This coupon has reached its usage limit')
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) throw userError('Minimum order is required for this coupon')
  const discount = await discountAmount(coupon, items)
  if (discount.total === 0 && coupon.type !== 'FREE_SHIPPING') throw userError('This discount does not apply to the items in your cart')
  return { discount, coupon }
}

/**
 * Automatic (codeless) discounts only ever apply when the customer didn't
 * enter a code -- an explicitly typed code always wins, keeping exactly one
 * discount on an order. Ineligible automatic discounts (wrong subtotal,
 * outside their date range, exhausted, first-order-only for an ineligible
 * customer, or simply not matching any item in this cart) are silently
 * skipped rather than surfaced as an error, since the customer never asked
 * for them by name. Among the remaining eligible candidates, the one worth
 * the most to the customer is applied.
 */
export async function findAutomaticDiscount(subtotal: number, userId: string | null, items: LineItem[]) {
  const now = new Date()
  const candidates = await db.coupon.findMany({ where: { isActive: true, isAutomatic: true } })
  let best: { discount: DiscountSplit; coupon: any } | null = null
  // "First order only" needs to know whether this customer has ordered before; asked once, not
  // once per such discount (audit ME-03).
  let priorOrder: Promise<boolean> | null = null
  const hasPriorOrder = () => (priorOrder ??= userId
    ? db.order.findFirst({ where: { userId, status: { not: 'CANCELLED' } }, select: { id: true } }).then(Boolean)
    : Promise.resolve(false))
  for (const coupon of candidates) {
    if (misconfigured(coupon)) continue
    if (coupon.startsAt && coupon.startsAt > now) continue
    if (coupon.expiresAt && coupon.expiresAt < now) continue
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) continue
    if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) continue
    if (coupon.firstOrderOnly) {
      if (!userId) continue
      if (await hasPriorOrder()) continue
    }
    const discount = await discountAmount(coupon, items)
    if (discount.total === 0 && coupon.type !== 'FREE_SHIPPING') continue
    if (!best || discount.total > best.discount.total) best = { discount, coupon }
  }
  // Quantity deals (Marketing > Quantity deals: "Buy 2, save 10%") compete like any automatic
  // discount: the one that saves the shopper most wins, and a typed code replaces them all. They
  // have no row to count uses on, so the "coupon" is a stand-in with no id (like an invite code).
  const quantity = bestDeal(await getQuantityDeals().catch(() => ({ enabled: false, deals: [] })), items)
  if (quantity && (!best || quantity.split.total > best.discount.total)) {
    best = { discount: quantity.split, coupon: { id: null, code: `QTY-${quantity.deal.id.slice(-6).toUpperCase()}`, type: 'FIXED', value: 0, isActive: true, isAutomatic: true, maxUses: null, usedCount: 0, firstOrderOnly: false, quantityDeal: { id: quantity.deal.id, name: quantity.deal.name } } }
  }
  return best ?? { discount: zeroSplit(), coupon: null as any }
}
