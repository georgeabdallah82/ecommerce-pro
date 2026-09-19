import { createHash, randomUUID } from 'node:crypto'
import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { checkoutSchema } from '@/lib/validation'
import { json } from '@/lib/utils'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { releaseOrderReservations, reserveStock } from '@/lib/inventory'
import { getPaymentProvider } from '@/lib/payments'
import { sendNewOrderPush } from '@/lib/push'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { PaymentMethod } from '@prisma/client'
import { ZodError } from 'zod'

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`
}

function checkoutFingerprint(userId: string | null, input: any, merged: Map<string, { productId: string; variantId: string | null; quantity: number }>) {
  const items = [...merged.values()].sort((a, b) => `${a.productId}:${a.variantId ?? ''}`.localeCompare(`${b.productId}:${b.variantId ?? ''}`))
  return createHash('sha256').update(stableSerialize({
    userId,
    email: input.email,
    phone: input.phone || null,
    items,
    couponCode: input.couponCode || null,
    giftCardCode: input.giftCardCode || null,
    paymentMethod: input.paymentMethod,
    coinsToUse: input.coinsToUse || 0,
    shippingAddress: input.shippingAddress,
  })).digest('hex')
}

type LineItem = { productId: string; quantity: number; unitPrice: number; totalPrice: number }

/**
 * Resolves a discount's target scope (the whole cart, a specific product
 * list, or a specific collection list) down to the concrete set of eligible
 * product ids. Collection membership lives on the Collection side of the
 * relation (Collection.products), not Product.collections, so it's resolved
 * with its own lookup rather than assuming the product records already carry
 * their collection ids.
 */
async function resolveEligibleProductIds(scope: string | undefined, productIds: string[] | undefined, collectionIds: string[] | undefined): Promise<Set<string> | 'ALL'> {
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

function eligibleLineItems(items: LineItem[], eligible: Set<string> | 'ALL') {
  return eligible === 'ALL' ? items : items.filter(item => eligible.has(item.productId))
}

/**
 * Buy X, get Y: for every `buyQuantity` eligible units in the cart, `getQuantity`
 * units from the (separately configurable) "get" scope are discounted by
 * `getDiscountPercent` (100 = free). Matches Shopify's own behavior of
 * discounting the cheapest eligible "get" units first, so the customer never
 * ends up with less value than the offer promises regardless of cart order.
 */
async function buyXGetYDiscount(coupon: any, items: LineItem[]) {
  const buyEligible = await resolveEligibleProductIds(coupon.appliesTo, coupon.productIds, coupon.collectionIds)
  const buyQuantityInCart = eligibleLineItems(items, buyEligible).reduce((sum, item) => sum + item.quantity, 0)
  const buyQuantity = Math.max(1, coupon.buyQuantity || 1)
  const getQuantity = Math.max(1, coupon.getQuantity || 1)
  const timesEarned = Math.floor(buyQuantityInCart / buyQuantity)
  if (timesEarned <= 0) return 0

  const getScope = coupon.getAppliesTo || coupon.appliesTo
  const getProductIds = coupon.getProductIds?.length ? coupon.getProductIds : coupon.productIds
  const getCollectionIds = coupon.getCollectionIds?.length ? coupon.getCollectionIds : coupon.collectionIds
  const getEligible = await resolveEligibleProductIds(getScope, getProductIds, getCollectionIds)
  const unitPrices = eligibleLineItems(items, getEligible)
    .flatMap(item => Array(item.quantity).fill(item.unitPrice))
    .sort((a, b) => a - b)

  const discountedCount = Math.min(unitPrices.length, timesEarned * getQuantity)
  const percent = Math.min(100, Math.max(0, coupon.getDiscountPercent ?? 100))
  return unitPrices.slice(0, discountedCount).reduce((sum, price) => sum + Math.floor(price * percent / 100), 0)
}

async function discountAmount(coupon: any, items: LineItem[]) {
  if (coupon.type === 'BUY_X_GET_Y') return buyXGetYDiscount(coupon, items)
  const eligible = await resolveEligibleProductIds(coupon.appliesTo, coupon.productIds, coupon.collectionIds)
  const eligibleSubtotal = eligibleLineItems(items, eligible).reduce((sum, item) => sum + item.totalPrice, 0)
  return coupon.type === 'PERCENTAGE'
    ? Math.min(eligibleSubtotal, Math.floor(eligibleSubtotal * coupon.value / 100))
    : coupon.type === 'FIXED'
      ? Math.min(eligibleSubtotal, coupon.value)
      : 0
}

function misconfigured(coupon: { type: string; value: number; buyQuantity: number | null; getQuantity: number | null }) {
  if (coupon.type === 'PERCENTAGE' && (coupon.value < 1 || coupon.value > 100)) return true
  if (coupon.type === 'BUY_X_GET_Y' && (!coupon.buyQuantity || coupon.buyQuantity < 1 || !coupon.getQuantity || coupon.getQuantity < 1)) return true
  return false
}

async function applyCoupon(code: string, subtotal: number, items: LineItem[]) {
  if (!code) return { discount: 0, coupon: null as any }
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } })
  const now = new Date()
  if (!coupon || !coupon.isActive) throw new Error('Invalid coupon code')
  if (misconfigured(coupon)) throw new Error('This discount is not configured correctly')
  if (coupon.startsAt && coupon.startsAt > now) throw new Error('This coupon is not active yet')
  if (coupon.expiresAt && coupon.expiresAt < now) throw new Error('This coupon has expired')
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its usage limit')
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) throw new Error('Minimum order is required for this coupon')
  const discount = await discountAmount(coupon, items)
  if (discount === 0 && coupon.type !== 'FREE_SHIPPING') throw new Error('This discount does not apply to the items in your cart')
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
async function findAutomaticDiscount(subtotal: number, userId: string | null, items: LineItem[]) {
  const now = new Date()
  const candidates = await db.coupon.findMany({ where: { isActive: true, isAutomatic: true } })
  let best: { discount: number; coupon: any } | null = null
  for (const coupon of candidates) {
    if (misconfigured(coupon)) continue
    if (coupon.startsAt && coupon.startsAt > now) continue
    if (coupon.expiresAt && coupon.expiresAt < now) continue
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) continue
    if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) continue
    if (coupon.firstOrderOnly) {
      if (!userId) continue
      const existingOrder = await db.order.findFirst({ where: { userId, status: { not: 'CANCELLED' } }, select: { id: true } })
      if (existingOrder) continue
    }
    const discount = await discountAmount(coupon, items)
    if (discount === 0 && coupon.type !== 'FREE_SHIPPING') continue
    if (!best || discount > best.discount) best = { discount, coupon }
  }
  return best ?? { discount: 0, coupon: null as any }
}

function providerCheckout(rawJson: string | null) {
  if (!rawJson) return null
  try {
    const parsed = JSON.parse(rawJson) as { clientCheckout?: unknown }
    return parsed.clientCheckout || null
  } catch {
    return null
  }
}

const SAFE_CHECKOUT_MESSAGES = new Set([
  'Invalid coupon code',
  'This discount is not configured correctly',
  'This coupon is not active yet',
  'This coupon has expired',
  'This coupon has reached its usage limit',
  'Minimum order is required for this coupon',
  'This discount does not apply to the items in your cart',
  'This coupon requires a customer account',
  'This coupon is for first orders only',
  'This coupon is no longer available',
  'Your cart is empty.',
  'One or more products are unavailable',
  'Invalid product option selected.',
  'Payment method is currently unavailable.',
  'Wallet checkout requires a customer account.',
  'Insufficient wallet balance.',
  'Insufficient coin balance.',
  'Coin redemption exceeds the merchandise total.',
  'Invalid gift card code',
  'This gift card is no longer active',
  'This gift card has expired',
  'This gift card has no remaining balance',
  'This gift card cannot be used for this order currency',
  'This gift card is no longer available',
])

function checkoutFailure(error: unknown) {
  if (error instanceof ZodError) return { message: 'Please check your checkout details and try again.', status: 400 }
  if (error instanceof SyntaxError) return { message: 'Invalid checkout request.', status: 400 }
  const message = error instanceof Error ? error.message : ''
  if (message === 'This idempotency key was already used for a different checkout') return { message, status: 409 }
  if (message.startsWith('Maximum quantity per product is ')) return { message, status: 400 }
  if (SAFE_CHECKOUT_MESSAGES.has(message)) return { message, status: 400 }
  console.error('[checkout] unexpected failure', error)
  return { message: 'Unable to place your order right now. Please try again.', status: 500 }
}

function parseCoinsUsed(rawJson: string | null) {
  if (!rawJson) return 0
  try {
    const parsed = JSON.parse(rawJson) as { coinsUsed?: unknown }
    return Number.isSafeInteger(parsed.coinsUsed) ? Math.max(0, Number(parsed.coinsUsed)) : 0
  } catch { return 0 }
}

async function restoreCheckoutGiftCard(orderId: string) {
  await db.$transaction(async tx => {
    const checkoutTx = await tx.paymentTransaction.findFirst({ where: { orderId, provider: 'checkout' }, select: { rawJson: true } })
    const redeemed = redeemedGiftCard([{ provider: 'checkout', rawJson: checkoutTx?.rawJson || null }])
    if (!redeemed) return
    await restoreGiftCardBalance(tx, orderId, redeemed)
  })
}

async function restoreCheckoutCoins(orderId: string, userId: string | null) {
  if (!userId) return
  await db.$transaction(async tx => {
    const checkoutTx = await tx.paymentTransaction.findFirst({ where: { orderId, provider: 'checkout' }, select: { rawJson: true } })
    const coinsUsed = parseCoinsUsed(checkoutTx?.rawJson || null)
    if (!coinsUsed) return
    const referenceId = `coin-reversal:${orderId}:payment-init-failed`
    const existing = await tx.coinTransaction.findFirst({ where: { userId, referenceId, type: 'REVERSAL' }, select: { id: true } })
    if (existing) return
    await tx.coinTransaction.create({
      data: {
        id: `coin_${orderId}_payment_init_failed_reversal`,
        userId,
        amount: coinsUsed,
        type: 'REVERSAL',
        reason: 'Payment initialization failure coin restoration',
        referenceId,
      },
    })
  })
}

export async function POST(req: Request) {
  try {
    const currentIp = clientIp(req.headers)
    const user = await getCurrentUser()
    const limitKey = user?.id ? `checkout:user:${user.id}` : `checkout:ip:${currentIp}`
    const limit = consumeRateLimit(limitKey, 20, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many checkout attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } })

    const rawBody = await req.text()
    if (rawBody.length > 100_000) return json({ error: 'Checkout request is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })

    const input = checkoutSchema.parse(JSON.parse(rawBody))
    const idempotencyKey = req.headers.get('x-idempotency-key')?.trim().slice(0, 190) || null
    const paymentMethod = input.paymentMethod as PaymentMethod
    const paymentProvider = await getPaymentProvider()
    const settingRows = await db.setting.findMany({ where: { key: { in: ['payment.cod', 'payment.card', 'payment.bank', 'payment.wallet', 'checkout.guestCheckout'] } }, select: { key: true, value: true } })
    const settings = Object.fromEntries(settingRows.map(row => [row.key, row.value]))
    const guestCheckoutEnabled = settings['checkout.guestCheckout'] !== 'false'
    const paymentEnabled: Record<PaymentMethod, boolean> = {
      COD: settings['payment.cod'] !== 'false',
      CARD: settings['payment.card'] === 'true' && paymentProvider.name !== 'manual',
      BANK_TRANSFER: settings['payment.bank'] === 'true',
      WALLET: settings['payment.wallet'] === 'true' && Boolean(user?.id),
    }
    if (!user?.id && !guestCheckoutEnabled) return json({ error: 'Guest checkout is disabled. Please sign in to continue.' }, { status: 403 })
    if (paymentMethod === PaymentMethod.WALLET && !user?.id) return json({ error: 'Wallet checkout requires a customer account.' }, { status: 400 })
    if (!paymentEnabled[paymentMethod]) return json({ error: 'This payment method is currently unavailable.' }, { status: 400 })
    if (input.coinsToUse > 0 && !user?.id) return json({ error: 'This coupon requires a customer account' }, { status: 400 })

    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>()
    for (const item of input.items) {
      const key = `${item.productId}:${item.variantId ?? ''}`
      const current = merged.get(key)
      const quantity = (current?.quantity ?? 0) + item.quantity
      if (quantity > 99) throw new Error('Maximum quantity per product is 99')
      merged.set(key, { productId: item.productId, variantId: item.variantId ?? null, quantity })
    }
    if (merged.size === 0) return json({ error: 'Your cart is empty.' }, { status: 400 })

    const ids = [...new Set([...merged.values()].map(i => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: { variants: true, inventory: true, images: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    if (products.length !== ids.length) return json({ error: 'One or more products are unavailable' }, { status: 400 })

    const normalized: any[] = []
    let subtotal = 0
    for (const raw of merged.values()) {
      const p = byId.get(raw.productId)!
      const variant = raw.variantId ? p.variants.find(v => v.id === raw.variantId) : undefined
      if (raw.variantId && !variant) return json({ error: 'Invalid product option selected.' }, { status: 400 })
      if (p.trackInventory && !p.continueSellingWhenOutOfStock) {
        const dedicated = raw.variantId ? p.inventory.filter(x => x.variantId === raw.variantId) : []
        const stockRows = dedicated.length ? dedicated : p.inventory.filter(x => !x.variantId)
        const available = stockRows.reduce((s, x) => s + x.quantity - x.reserved, 0)
        if (available < raw.quantity) return json({ error: 'One or more requested quantities are no longer available.' }, { status: 409 })
      }
      const unitPrice = variant?.price ?? p.basePrice
      subtotal += unitPrice * raw.quantity
      normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? p.sku, quantity: raw.quantity, unitPrice, totalPrice: unitPrice * raw.quantity })
    }

    const { discount, coupon } = input.couponCode
      ? await applyCoupon(input.couponCode, subtotal, normalized)
      : await findAutomaticDiscount(subtotal, user?.id ?? null, normalized)
    if (coupon?.firstOrderOnly && !user?.id) throw new Error('This coupon requires a customer account')
    const discountedSubtotal = Math.max(0, subtotal - discount)
    const requestedCoins = Math.max(0, Number(input.coinsToUse || 0))
    const coinDiscount = Math.min(discountedSubtotal, requestedCoins)
    if (requestedCoins > discountedSubtotal && requestedCoins > 0) throw new Error('Coin redemption exceeds the merchandise total.')
    const rewardAdjustedSubtotal = Math.max(0, discountedSubtotal - coinDiscount)
    const shipping = await calculateShipping(input.shippingAddress.country, rewardAdjustedSubtotal)
    const taxRate = await getTaxRatePercent(input.shippingAddress.country)
    const taxTotal = Math.round(rewardAdjustedSubtotal * taxRate / 100)
    const shippingTotal = coupon?.type === 'FREE_SHIPPING' ? 0 : shipping.total
    const preGiftCardTotal = Math.max(0, rewardAdjustedSubtotal + shippingTotal + taxTotal)

    const orderCurrency = process.env.NEXT_PUBLIC_CURRENCY || 'USD'
    let giftCard: { id: string; balance: number } | null = null
    let giftCardDiscount = 0
    if (input.giftCardCode) {
      const found = await db.giftCard.findUnique({ where: { code: input.giftCardCode.toUpperCase() } })
      if (!found) throw new Error('Invalid gift card code')
      if (found.status !== 'ACTIVE') throw new Error('This gift card is no longer active')
      if (found.expiresAt && found.expiresAt < new Date()) throw new Error('This gift card has expired')
      if (found.balance <= 0) throw new Error('This gift card has no remaining balance')
      if (found.currency !== orderCurrency) throw new Error('This gift card cannot be used for this order currency')
      giftCard = found
      giftCardDiscount = Math.min(found.balance, preGiftCardTotal)
    }
    // Gift cards pay off the final total (post shipping/tax), unlike coin
    // redemption above which only ever discounts the merchandise subtotal --
    // matching how a real gift card is applied at the register.
    const grandTotal = Math.max(0, preGiftCardTotal - giftCardDiscount)
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(0, 6).toUpperCase()}`
    const fingerprint = checkoutFingerprint(user?.id ?? null, input, merged)

    const result = await db.$transaction(async tx => {
      if (idempotencyKey) {
        const existing = await tx.paymentTransaction.findFirst({ where: { provider: 'checkout', externalId: idempotencyKey }, include: { order: true } })
        if (existing?.order) {
          let existingFingerprint: string | null = null
          if (existing.rawJson) {
            try {
              const parsed = JSON.parse(existing.rawJson) as { fingerprint?: unknown }
              existingFingerprint = typeof parsed.fingerprint === 'string' ? parsed.fingerprint : null
            } catch { existingFingerprint = null }
          }
          if (existingFingerprint && existingFingerprint !== fingerprint) throw new Error('This idempotency key was already used for a different checkout')
          return { existing: true as const, order: existing.order }
        }
      }

      if (coupon?.firstOrderOnly && user?.id) {
        const existingOrder = await tx.order.findFirst({ where: { userId: user.id, status: { not: 'CANCELLED' } }, select: { id: true } })
        if (existingOrder) throw new Error('This coupon is for first orders only')
      }

      if (user?.id && requestedCoins > 0) {
        const coinAggregate = await tx.coinTransaction.aggregate({ where: { userId: user.id }, _sum: { amount: true } })
        const coinBalance = Math.max(0, Number(coinAggregate._sum.amount || 0))
        if (requestedCoins > coinBalance) throw new Error('Insufficient coin balance.')
        await tx.coinTransaction.create({ data: { id: `coin_${user.id}_${orderNumber}_redemption`, userId: user.id, amount: -requestedCoins, type: 'REDEMPTION', reason: 'Checkout coin redemption', referenceId: orderNumber } })
      }

      if (paymentMethod === PaymentMethod.WALLET && grandTotal > 0) {
        const walletCurrency = process.env.NEXT_PUBLIC_CURRENCY || 'USD'
        const walletAggregate = await tx.walletTransaction.aggregate({ where: { userId: user!.id, currency: walletCurrency }, _sum: { amount: true } })
        const walletBalance = Number(walletAggregate._sum.amount || 0)
        if (walletBalance < grandTotal) throw new Error('Insufficient wallet balance.')
        await tx.walletTransaction.create({ data: { id: `wal_${user!.id}_${orderNumber}_payment`, userId: user!.id, amount: -grandTotal, currency: walletCurrency, type: 'PAYMENT', reason: 'Wallet checkout payment', referenceId: orderNumber } })
      }

      for (const item of normalized) await reserveStock(tx, byId.get(item.productId)!, item.variantId, item.quantity, orderNumber)
      if (coupon) {
        const couponUpdate = await tx.coupon.updateMany({ where: { id: coupon.id, isActive: true, ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}) }, data: { usedCount: { increment: 1 } } })
        if (couponUpdate.count !== 1) throw new Error('This coupon is no longer available')
      }
      if (giftCard && giftCardDiscount > 0) {
        const giftCardUpdate = await tx.giftCard.updateMany({ where: { id: giftCard.id, status: 'ACTIVE', balance: { gte: giftCardDiscount } }, data: { balance: { decrement: giftCardDiscount } } })
        if (giftCardUpdate.count !== 1) throw new Error('This gift card is no longer available')
      }

      const paidByWallet = paymentMethod === PaymentMethod.WALLET
      // A gift card can cover the entire total on its own -- in that case there's
      // nothing left for CARD to charge, so the order is treated as paid upfront
      // just like WALLET, and the CARD provider round-trip is skipped below.
      const paidUpfront = paidByWallet || grandTotal === 0
      const orderStatus = paidUpfront ? 'CONFIRMED' : 'PENDING'
      const paymentStatus = paidUpfront ? 'PAID' : 'UNPAID'
      const checkoutTxRaw: Record<string, unknown> = { coinDiscount, coinsUsed: requestedCoins }
      if (idempotencyKey) checkoutTxRaw.fingerprint = fingerprint
      if (giftCard && giftCardDiscount > 0) { checkoutTxRaw.giftCardId = giftCard.id; checkoutTxRaw.giftCardAmount = giftCardDiscount }
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user?.id ?? null,
          email: input.email,
          phone: input.phone || null,
          subtotal,
          discountTotal: discount + coinDiscount + giftCardDiscount,
          shippingTotal,
          taxTotal,
          grandTotal,
          currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD',
          status: orderStatus,
          paymentStatus,
          paymentMethod,
          shippingAddressJson: JSON.stringify(input.shippingAddress),
          couponCode: coupon?.code ?? null,
          shippingMethod: shipping.method,
          items: { create: normalized },
          events: { create: { status: orderStatus, message: paidByWallet ? `Order placed using wallet${coinDiscount ? ` and ${requestedCoins} coins` : ''}.` : paidUpfront ? 'Order placed successfully using a gift card.' : 'Order placed successfully.' } },
          paymentTransactions: { create: { provider: 'checkout', externalId: idempotencyKey, status: paidUpfront ? 'paid' : 'created', amount: grandTotal, currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD', rawJson: JSON.stringify(checkoutTxRaw) } },
        },
      })
      return { existing: false as const, order }
    })

    if (result.existing) {
      const providerTx = paymentMethod === PaymentMethod.CARD
        ? await db.paymentTransaction.findFirst({ where: { orderId: result.order.id, provider: paymentProvider.name }, orderBy: { createdAt: 'desc' } })
        : null
      return json({ order: { id: result.order.id, orderNumber: result.order.orderNumber, total: result.order.grandTotal }, payment: providerCheckout(providerTx?.rawJson || null) }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }

    const order = result.order
    let clientCheckout: any = null
    if (paymentMethod === PaymentMethod.CARD && order.grandTotal > 0) {
      try {
        const payment = await paymentProvider.createPayment({ orderId: order.orderNumber, amount: order.grandTotal, currency: order.currency, email: order.email })
        if (payment.externalId) {
          await db.paymentTransaction.create({ data: { orderId: order.id, provider: payment.provider, externalId: payment.externalId, status: payment.status, amount: order.grandTotal, currency: order.currency, rawJson: JSON.stringify({ clientCheckout: payment.clientCheckout ? { type: payment.clientCheckout.type, merchantId: payment.clientCheckout.merchantId, sessionId: payment.clientCheckout.sessionId } : null, successIndicator: payment.clientCheckout?.successIndicator || null }) } })
        }
        clientCheckout = payment.clientCheckout || null
      } catch (paymentError) {
        await db.$transaction(async tx => {
          await releaseOrderReservations(tx, order.id, 'Online payment initialization failed')
          if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
          await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', fulfillmentStatus: 'UNFULFILLED', events: { create: { status: 'CANCELLED', message: 'Online payment initialization failed.' } } } })
        })
        await restoreCheckoutCoins(order.id, order.userId)
        await restoreCheckoutGiftCard(order.id)
        throw paymentError
      }
    }

    if (user?.id) {
      try {
        await db.notification.create({ data: { userId: user.id, title: 'Order placed', body: `Order ${order.orderNumber} was placed successfully.`, type: 'ORDER_CREATED' } })
      } catch (error) {
        console.error('[checkout] order notification failed', error)
      }
    }
    void sendNewOrderPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }).catch(error => console.error('[push] new-order notification failed', error))
    if (paymentMethod !== PaymentMethod.CARD || order.grandTotal === 0) {
      void sendOrderConfirmationEmail(order.id).catch(error => console.error('[email] order confirmation failed', error))
    }
    void dispatchWebhookEvent('order.created', { id: order.id, orderNumber: order.orderNumber, email: order.email, grandTotal: order.grandTotal, currency: order.currency, status: order.status, paymentStatus: order.paymentStatus }).catch(error => console.error('[webhook] order.created dispatch failed', error))
    await audit(user?.id, 'order.created', 'Order', order.id, { orderNumber: order.orderNumber, total: grandTotal, paymentMethod, paymentProvider: paymentMethod === PaymentMethod.CARD ? paymentProvider.name : paymentMethod.toLowerCase(), coinsUsed: requestedCoins, coinDiscount, giftCardAmount: giftCardDiscount })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.grandTotal }, payment: clientCheckout, rewards: { coinsUsed: requestedCoins, coinDiscount, giftCardAmount: giftCardDiscount } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const failure = checkoutFailure(error)
    return json({ error: failure.message }, { status: failure.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
