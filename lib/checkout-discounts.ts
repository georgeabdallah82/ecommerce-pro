import { db } from '@/lib/prisma'
import { discountAmount, misconfigured, zeroSplit, type DiscountSplit, type LineItem } from '@/lib/discounts'

// The discount a cart gets at checkout: a code the customer typed, or else the best automatic
// discount. Shared by checkout (app/api/checkout/route.ts) and the order summary's live price
// (app/api/checkout/quote/route.ts), so both always agree.

export async function applyCoupon(code: string, subtotal: number, items: LineItem[]) {
  if (!code) return { discount: zeroSplit(), coupon: null as any }
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } })
  const now = new Date()
  if (!coupon || !coupon.isActive) throw new Error('Invalid coupon code')
  if (misconfigured(coupon)) throw new Error('This discount is not configured correctly')
  if (coupon.startsAt && coupon.startsAt > now) throw new Error('This coupon is not active yet')
  if (coupon.expiresAt && coupon.expiresAt < now) throw new Error('This coupon has expired')
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its usage limit')
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) throw new Error('Minimum order is required for this coupon')
  const discount = await discountAmount(coupon, items)
  if (discount.total === 0 && coupon.type !== 'FREE_SHIPPING') throw new Error('This discount does not apply to the items in your cart')
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
  return best ?? { discount: zeroSplit(), coupon: null as any }
}
