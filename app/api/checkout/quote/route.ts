import { z } from 'zod'
import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { zeroSplit } from '@/lib/discounts'
import { applyCoupon, findAutomaticDiscount } from '@/lib/checkout-discounts'
import { bundleDiscount } from '@/lib/bundles'
import { freeGiftFor } from '@/lib/free-gift'
import { orderedBefore } from '@/lib/customer-history'
import { checkInvite } from '@/lib/invites'
import { userError } from '@/lib/user-error'
import { orderMoney } from '@/lib/checkout-totals'
import { giftCardProblem } from '@/lib/gift-cards'
import { getStoreCurrency } from '@/lib/store-currency'

// The checkout summary's price before the order is placed: the cart priced from the database, with
// the discount code (or the best automatic discount), bundles, the shopper's coins, a gift card,
// delivery for the chosen area and tax. The figures come from the same steps as placing the order
// (app/api/checkout/route.ts, both through lib/checkout-totals.ts), so the total the shopper sees is
// the total they pay. Reads only; nothing is reserved or saved.
const quoteSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(64), variantId: z.string().max(64).nullable().optional(), quantity: z.number().int().min(1).max(99), bundleId: z.string().max(64).nullable().optional() })).min(1).max(100),
  couponCode: z.string().trim().max(60).optional().or(z.literal('')),
  country: z.string().trim().min(2).max(80),
  region: z.string().trim().max(100).optional().or(z.literal('')),
  shippingRateId: z.string().trim().max(60).optional().or(z.literal('')),
  // For "first order only" codes without an account (lib/customer-history.ts orderedBefore).
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().max(190).optional().or(z.literal('')),
  coinsToUse: z.number().int().min(0).max(1000000).default(0),
  giftCardCode: z.string().trim().max(60).optional().or(z.literal('')),
})

// Coupon problems the customer can act on, shown under the code box (the same wording checkout uses).
const COUPON_MESSAGES = new Set([
  'Invalid coupon code', 'This discount is not configured correctly', 'This coupon is not active yet', 'This coupon has expired',
  'This coupon has reached its usage limit', 'Minimum order is required for this coupon', 'This discount does not apply to the items in your cart',
  'This coupon requires a customer account', 'This coupon is for first orders only',
  'This is your own invite code. Share it with your friends.',
])

const storeCountry = async () => (await db.setting.findUnique({ where: { key: 'store.country' } }).catch(() => null))?.value || 'Lebanon'

export async function POST(req: Request) {
  // Durable, so the limit holds across worker instances (lib/rate-limit.ts). Set above what one shopper
  // needs while changing the address, the code and the coins, since many shoppers share a mobile
  // carrier's address.
  const limit = await consumeDurableRateLimit(`checkout-quote:${clientIp(req.headers)}`, 120, 10 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
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
      if (applied.coupon?.firstOrderOnly && !user?.id && await orderedBefore(input.phone, input.email, await storeCountry())) throw userError('This coupon is for first orders only')
      if (applied.coupon?.invite) await checkInvite(applied.coupon.invite, { phone: input.phone, email: input.email, userId: user?.id }, await storeCountry())
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

    // Coins come from the signed-in shopper's balance and never exceed the merchandise (checkout checks the same).
    const balance = user?.id ? Math.max(0, Number((await db.coinTransaction.aggregate({ where: { userId: user.id }, _sum: { amount: true } }))._sum.amount || 0)) : 0
    const maxCoins = Math.min(balance, discountedSubtotal)
    let coinsError = ''
    let coinsApplied = 0
    if (input.coinsToUse > 0) {
      if (!user?.id) coinsError = 'Sign in to use your coins.'
      else if (input.coinsToUse > balance) coinsError = 'Insufficient coin balance.'
      else if (input.coinsToUse > discountedSubtotal) coinsError = 'Coin redemption exceeds the merchandise total.'
      else coinsApplied = input.coinsToUse
    }

    // A gift card is checked the way checkout checks it (lib/gift-cards.ts giftCardProblem).
    let giftCard: { balance: number } | null = null
    let giftCardError = ''
    if (input.giftCardCode) {
      const found = await db.giftCard.findUnique({ where: { code: input.giftCardCode.toUpperCase() } })
      if (!found) giftCardError = 'Invalid gift card code'
      else {
        giftCardError = giftCardProblem(found, await getStoreCurrency()) || ''
        if (!giftCardError) giftCard = found
      }
    }

    const money = await orderMoney({
      discountedSubtotal, taxableSubtotal, discountTaxable: discount.taxable, coinsApplied,
      requiresShipping, freeShipping: applied.coupon?.type === 'FREE_SHIPPING',
      shippingFor: basis => calculateShipping(input.country, basis, input.shippingRateId || null, input.region || null)
        .catch(() => calculateShipping(input.country, basis, null, input.region || null)),
      taxRatePercent: await getTaxRatePercent(input.country),
      giftCardBalance: giftCard ? giftCard.balance : null,
    })

    // Free gift above an amount (lib/free-gift.ts), shown in the summary as checkout will add it.
    const gift = await freeGiftFor(subtotal).catch(() => null)

    return json({
      subtotal,
      freeGift: gift ? { name: gift.line.name.replace(/ \(Free gift\)$/, ''), image: gift.image } : null,
      discount: discount.total,
      discountCode: input.couponCode && applied.coupon ? String(applied.coupon.code) : null,
      automaticDiscount: !input.couponCode && applied.coupon ? true : false,
      bundleDiscount: bundles.total,
      shipping: money.shippingTotal,
      shippingMethod: money.shipping.method,
      freeShipping: applied.coupon?.type === 'FREE_SHIPPING',
      tax: money.taxTotal,
      coins: money.coinDiscount,
      maxCoins,
      coinsError,
      giftCard: money.giftCardDiscount,
      giftCardError,
      total: money.grandTotal,
      couponError,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: 'Invalid request' }, { status: 400 })
    console.error('[checkout] quote failed', error)
    return json({ error: 'Unable to price the cart right now' }, { status: 500 })
  }
}
