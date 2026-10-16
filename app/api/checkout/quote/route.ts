import { z } from 'zod'
import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { taxableAmountAfterRewards, zeroSplit } from '@/lib/discounts'
import { applyCoupon, findAutomaticDiscount } from '@/lib/checkout-discounts'
import { bundleDiscount } from '@/lib/bundles'

// The checkout summary's price before the order is placed: the cart priced from the database,
// with the discount code (or the best automatic discount), bundles, delivery for the chosen area
// and tax -- the same steps and order as placing the order (app/api/checkout/route.ts), so the
// total the customer sees is the total they pay. Coins and gift cards are applied at the order.
// Reads only; nothing is reserved or saved.
const quoteSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(64), variantId: z.string().max(64).nullable().optional(), quantity: z.number().int().min(1).max(99), bundleId: z.string().max(64).nullable().optional() })).min(1).max(100),
  couponCode: z.string().trim().max(60).optional().or(z.literal('')),
  country: z.string().trim().min(2).max(80),
  region: z.string().trim().max(100).optional().or(z.literal('')),
  shippingRateId: z.string().trim().max(60).optional().or(z.literal('')),
})

// Coupon problems the customer can act on, shown under the code box (the same wording checkout uses).
const COUPON_MESSAGES = new Set([
  'Invalid coupon code', 'This discount is not configured correctly', 'This coupon is not active yet', 'This coupon has expired',
  'This coupon has reached its usage limit', 'Minimum order is required for this coupon', 'This discount does not apply to the items in your cart',
  'This coupon requires a customer account',
])

export async function POST(req: Request) {
  const limit = consumeRateLimit(`checkout-quote:${clientIp(req.headers)}`, 60, 10 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests' }, { status: 429 })
  try {
    const input = quoteSchema.parse(await req.json())
    const user = await getCurrentUser().catch(() => null)

    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>()
    for (const item of input.items) {
      const key = `${item.productId}:${item.variantId ?? ''}`
      merged.set(key, { productId: item.productId, variantId: item.variantId ?? null, quantity: Math.min(99, (merged.get(key)?.quantity ?? 0) + item.quantity) })
    }
    const ids = [...new Set([...merged.values()].map(i => i.productId))]
    const unpublishedIds = await getUnpublishedProductIds()
    const products = await db.product.findMany({ where: { id: { in: ids, notIn: unpublishedIds }, status: 'ACTIVE' }, select: { id: true, name: true, sku: true, basePrice: true, taxable: true, requiresShipping: true, variants: { select: { id: true, name: true, sku: true, price: true } } } })
    const byId = new Map(products.map(p => [p.id, p]))
    if (products.length !== ids.length) return json({ error: 'One or more products are unavailable' }, { status: 400 })

    let subtotal = 0
    let taxableSubtotal = 0
    const normalized: Array<{ productId: string; variantId: string | null; name: string; sku: string; quantity: number; unitPrice: number; totalPrice: number; taxable: boolean }> = []
    for (const line of merged.values()) {
      const p = byId.get(line.productId)!
      const variant = line.variantId ? p.variants.find(v => v.id === line.variantId) : undefined
      if (line.variantId && !variant) return json({ error: 'Invalid product option selected.' }, { status: 400 })
      const unitPrice = variant?.price ?? p.basePrice
      const totalPrice = unitPrice * line.quantity
      subtotal += totalPrice
      if (p.taxable) taxableSubtotal += totalPrice
      normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name, sku: variant?.sku ?? p.sku, quantity: line.quantity, unitPrice, totalPrice, taxable: p.taxable })
    }
    const requiresShipping = [...merged.values()].some(line => byId.get(line.productId)!.requiresShipping !== false)

    let couponError = ''
    let applied: { discount: ReturnType<typeof zeroSplit>; coupon: any } = { discount: zeroSplit(), coupon: null }
    try {
      applied = input.couponCode ? await applyCoupon(input.couponCode, subtotal, normalized) : await findAutomaticDiscount(subtotal, user?.id ?? null, normalized)
      if (applied.coupon?.firstOrderOnly && !user?.id) throw new Error('This coupon requires a customer account')
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      couponError = COUPON_MESSAGES.has(message) ? message : 'Invalid coupon code'
      applied = { discount: zeroSplit(), coupon: null }
    }
    const bundles = await bundleDiscount(input.items.map(item => ({ productId: item.productId, variantId: item.variantId ?? null, quantity: item.quantity, bundleId: item.bundleId ?? null })), normalized)
    const discount = bundles.total ? {
      total: Math.min(subtotal, applied.discount.total + bundles.total),
      taxable: Math.min(taxableSubtotal, applied.discount.taxable + bundles.taxable),
    } : applied.discount
    const discountedSubtotal = Math.max(0, subtotal - discount.total)

    let shipping = { total: 0, method: 'No shipping required' }
    if (requiresShipping) {
      const region = input.region || null
      shipping = await calculateShipping(input.country, discountedSubtotal, input.shippingRateId || null, region)
        .catch(() => calculateShipping(input.country, discountedSubtotal, null, region))
    }
    const freeShipping = applied.coupon?.type === 'FREE_SHIPPING'
    const shippingTotal = freeShipping ? 0 : shipping.total
    const taxRate = await getTaxRatePercent(input.country)
    const taxTotal = Math.round(taxableAmountAfterRewards(taxableSubtotal, discount.taxable, discountedSubtotal, 0) * taxRate / 100)

    return json({
      subtotal,
      discount: discount.total,
      discountCode: input.couponCode && applied.coupon ? String(applied.coupon.code) : null,
      automaticDiscount: !input.couponCode && applied.coupon ? true : false,
      bundleDiscount: bundles.total,
      shipping: shippingTotal,
      shippingMethod: shipping.method,
      freeShipping,
      tax: taxTotal,
      total: Math.max(0, discountedSubtotal + shippingTotal + taxTotal),
      couponError,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: 'Invalid request' }, { status: 400 })
    console.error('[checkout] quote failed', error)
    return json({ error: 'Unable to price the cart right now' }, { status: 500 })
  }
}
