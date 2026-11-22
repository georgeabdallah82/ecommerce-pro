import { createHash, randomUUID } from 'node:crypto'
import { TransactionUnavailableError, db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { checkoutSchema } from '@/lib/validation'
import { json } from '@/lib/utils'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { DELIVERY_COUNTRIES_KEY, countryCode, deliveryCountries } from '@/lib/delivery-countries'
import { addressWithPin } from '@/lib/location-pin'
import { releaseOrderReservations, reserveStock, undoReservations } from '@/lib/inventory'
import { getPaymentProvider } from '@/lib/payments'
import { sendNewOrderPush } from '@/lib/push'
import { alertCheckoutFailure } from '@/lib/order-alerts'
import { armOrderWatch } from '@/lib/order-watch-storage'
import { armHourlyJobs } from '@/lib/hourly-jobs-storage'
import { riskNote } from '@/lib/order-risk'
import { sendAbandonedCheckoutEmail, sendOrderConfirmationEmail } from '@/lib/email'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { giftCardProblem, redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { getStoreCurrency } from '@/lib/store-currency'
import { orderMoney, orderRecordTotals } from '@/lib/checkout-totals'
import { applyCoupon, findAutomaticDiscount } from '@/lib/checkout-discounts'
import { PaymentMethod } from '@prisma/client'
import { ZodError } from 'zod'
import { nextOrderNumber } from '@/lib/order-number'
import { runInBackground } from '@/lib/background'
import { markCheckoutsRecovered, maybeSendCartReminders } from '@/lib/cart-reminders'
import { internationalPhone } from '@/lib/phone'
import { freeGiftFor } from '@/lib/free-gift'
import { orderedBefore, usedCodeBefore } from '@/lib/customer-history'
import { checkInvite } from '@/lib/invites'
import { adContextFromRequest, sendMetaPurchase } from '@/lib/meta-capi'
import { orderSuccessPath } from '@/lib/order-access'
import { BLOCKED_MESSAGE, BLOCKED_PHONES_KEY, isBlocked, parseBlockedPhones } from '@/lib/blocked-phones'
import { bundleDiscount } from '@/lib/bundles'
import { userError } from '@/lib/user-error'
import { shopperLang } from '@/lib/message-lang'

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
    bundles: (input.items || []).filter((i: any) => i.bundleId).map((i: any) => `${i.bundleId}:${i.productId}:${i.variantId ?? ''}:${i.quantity}`).sort(),
    couponCode: input.couponCode || null,
    giftCardCode: input.giftCardCode || null,
    paymentMethod: input.paymentMethod,
    coinsToUse: input.coinsToUse || 0,
    shippingRateId: input.shippingRateId || null,
    shippingAddress: input.shippingAddress,
  })).digest('hex')
}

// Requests that share an idempotency key queue on this lock inside their transaction. The first
// creates the order and commits; the rest then find it (the lookup further down). Without it, the
// same key sent several times at once, such as a retry while the first request is still running,
// created several orders. The offline mock store has no database to lock, so there it does nothing.
async function lockIdempotencyKey(tx: any, key: string) {
  if (typeof tx.$queryRaw !== 'function') return
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${key}`}))::text`
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
  'You have already used this code',
  'This coupon is no longer available',
  'This is your own invite code. Share it with your friends.',
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
  'Selected shipping method is no longer available',
  'A shipping address is required for this order.',
  'A phone number is required so the courier can reach you.',
  'Add a phone number or an email so we can reach you.',
])

function checkoutFailure(error: unknown) {
  if (error instanceof ZodError) return { message: 'Please check your checkout details and try again.', status: 400 }
  // A wallet or coin payment that could not run as one transaction changed nothing: ask to try again.
  if (error instanceof TransactionUnavailableError) return { message: error.message, status: 503 }
  if (error instanceof SyntaxError) return { message: 'Invalid checkout request.', status: 400 }
  const message = error instanceof Error ? error.message : ''
  if (message === 'This idempotency key was already used for a different checkout') return { message, status: 409 }
  if (message.startsWith('Maximum quantity per product is ')) return { message, status: 400 }
  // reserveStock throws this when another shopper took the last units between our stock
  // check and the reservation -- tell the customer, instead of a generic "try again" 500.
  if (message.startsWith('Not enough stock for ')) return { message: 'One or more requested quantities are no longer available.', status: 409 }
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

// Both restores run inside the transaction that cancels an unpaid checkout (the payment-start compensation below).
async function restoreCheckoutGiftCard(tx: any, orderId: string, grandTotal: number) {
  const checkoutTx = await tx.paymentTransaction.findFirst({ where: { orderId, provider: 'checkout' }, select: { rawJson: true } })
  const redeemed = redeemedGiftCard([{ provider: 'checkout', rawJson: checkoutTx?.rawJson || null }])
  if (!redeemed) return
  await restoreGiftCardBalance(tx, orderId, redeemed, grandTotal, grandTotal)
}

async function restoreCheckoutCoins(tx: any, orderId: string, userId: string | null) {
  if (!userId) return
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
}

export async function POST(req: Request) {
  try {
    const currentIp = clientIp(req.headers)
    const user = await getCurrentUser()
    const limitKey = user?.id ? `checkout:user:${user.id}` : `checkout:ip:${currentIp}`
    // Signed-in customers are limited per account; guests per IP, set higher because mobile
    // carriers put many shoppers behind one address.
    const limit = await consumeDurableRateLimit(limitKey, user?.id ? 20 : 60, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many checkout attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } })

    const rawBody = await req.text()
    if (rawBody.length > 100_000) return json({ error: 'Checkout request is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })

    const input = checkoutSchema.parse(JSON.parse(rawBody))
    // A shared location is kept only when it is real and inside the delivery country (lib/location-pin.ts).
    input.shippingAddress = addressWithPin(input.shippingAddress, countryCode(input.shippingAddress.country))
    // Email is optional (phone-only checkout); a signed-in customer's account email fills in.
    const orderEmail = input.email || String(user?.email || '').trim().toLowerCase()
    const idempotencyKey = req.headers.get('x-idempotency-key')?.trim().slice(0, 190) || null
    const paymentMethod = input.paymentMethod as PaymentMethod
    const paymentProvider = await getPaymentProvider()
    const settingRows = await db.setting.findMany({ where: { key: { in: ['payment.cod', 'payment.card', 'payment.bank', 'payment.wallet', 'checkout.guestCheckout', BLOCKED_PHONES_KEY, 'store.country', DELIVERY_COUNTRIES_KEY] } }, select: { key: true, value: true } })
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
    if (input.coinsToUse > 0 && !user?.id) return json({ error: 'Sign in to use your coins.' }, { status: 400 })
    // Only the countries the store delivers to (Settings > Shipping & delivery).
    if (!deliveryCountries(settings[DELIVERY_COUNTRIES_KEY], settings['store.country']).includes(countryCode(input.shippingAddress.country))) {
      return json({ error: "We don't deliver to this country yet. Please choose a country from the list." }, { status: 400 })
    }
    // Numbers the store blocked (repeatedly refused cash-on-delivery packages) can't order online.
    if (isBlocked(parseBlockedPhones(settings[BLOCKED_PHONES_KEY]), [input.phone, input.shippingAddress.phone], settings['store.country'])) return json({ error: BLOCKED_MESSAGE }, { status: 403 })

    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>()
    for (const item of input.items) {
      const key = `${item.productId}:${item.variantId ?? ''}`
      const current = merged.get(key)
      const quantity = (current?.quantity ?? 0) + item.quantity
      if (quantity > 99) throw userError('Maximum quantity per product is 99')
      merged.set(key, { productId: item.productId, variantId: item.variantId ?? null, quantity })
    }
    if (merged.size === 0) return json({ error: 'Your cart is empty.' }, { status: 400 })

    const ids = [...new Set([...merged.values()].map(i => i.productId))]
    const unpublishedIds = await getUnpublishedProductIds()
    const products = await db.product.findMany({ where: { id: { in: ids, notIn: unpublishedIds }, status: 'ACTIVE' }, include: { variants: true, inventory: true, images: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    if (products.length !== ids.length) return json({ error: 'One or more products are unavailable' }, { status: 400 })

    const normalized: any[] = []
    let subtotal = 0
    let taxableSubtotal = 0
    for (const raw of merged.values()) {
      const p = byId.get(raw.productId)!
      const variant = raw.variantId ? p.variants.find(v => v.id === raw.variantId) : undefined
      if (raw.variantId && !variant) return json({ error: 'Invalid product option selected.' }, { status: 400 })
      const stockRowsFor = () => {
        const dedicated = raw.variantId ? p.inventory.filter(x => x.variantId === raw.variantId) : []
        return dedicated.length ? dedicated : p.inventory.filter(x => !x.variantId)
      }
      if (p.trackInventory && !p.continueSellingWhenOutOfStock && !p.preorder) {
        const available = stockRowsFor().reduce((s, x) => s + x.quantity - x.reserved, 0)
        if (available < raw.quantity) return json({ error: 'One or more requested quantities are no longer available.' }, { status: 409 })
      }
      // Pre-order (product setting): sold out but still sold, and marked so on the order.
      const preordered = p.preorder && p.trackInventory && stockRowsFor().reduce((s, x) => s + x.quantity - x.reserved, 0) < raw.quantity
      const unitPrice = variant?.price ?? p.basePrice
      const totalPrice = unitPrice * raw.quantity
      subtotal += totalPrice
      if (p.taxable) taxableSubtotal += totalPrice
      normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name + (variant ? ` — ${variant.name}` : '') + (preordered ? ' (Pre-order)' : ''), sku: variant?.sku ?? p.sku, quantity: raw.quantity, unitPrice, totalPrice, taxable: p.taxable })
    }

    // requiresShipping defaults to true (a merchant's admin toggle for "Physical product --
    // collect shipping details"), so this is true whenever any item in the cart is a normal
    // physical product; only a cart made entirely of non-physical products (a digital download,
    // a service, etc.) skips both the delivery-address requirement and the shipping charge below.
    const requiresPhysicalShipping = [...merged.values()].some(raw => byId.get(raw.productId)!.requiresShipping !== false)
    if (requiresPhysicalShipping) {
      const addr = input.shippingAddress
      if (!addr.firstName?.trim() || !addr.lastName?.trim() || !addr.line1?.trim() || !addr.city?.trim()) {
        throw userError('A shipping address is required for this order.')
      }
      // The checkout form already asks for this; the server must too, or a direct request
      // (or a broken form) creates a delivery the courier has no way to arrange.
      if (String(input.phone || input.shippingAddress?.phone || '').replace(/\D/g, '').length < 6) throw userError('A phone number is required so the courier can reach you.')
    } else if (!orderEmail && String(input.phone || '').replace(/\D/g, '').length < 6) {
      // Nothing to deliver: the store still needs one way to reach the customer.
      throw userError('Add a phone number or an email so we can reach you.')
    }

    const { discount: couponDiscount, coupon } = input.couponCode
      ? await applyCoupon(input.couponCode, subtotal, normalized)
      : await findAutomaticDiscount(subtotal, user?.id ?? null, normalized)
    // Bundles (Marketing › Bundles) are priced again here from the bundle itself, never from
    // the cart; only complete sets get the bundle price.
    const bundles = await bundleDiscount(input.items.map(item => ({ productId: item.productId, variantId: item.variantId ?? null, quantity: item.quantity, bundleId: item.bundleId ?? null })), normalized)
    const discount = bundles.total ? {
      total: Math.min(subtotal, couponDiscount.total + bundles.total),
      taxable: Math.min(taxableSubtotal, couponDiscount.taxable + bundles.taxable),
      nonTaxable: couponDiscount.nonTaxable + bundles.nonTaxable,
    } : couponDiscount
    // "First order only" without an account (the welcome-popup code): this phone number or email
    // must not have ordered before.
    if (coupon?.firstOrderOnly && !user?.id && await orderedBefore(input.phone || input.shippingAddress.phone, orderEmail, settings['store.country'] || 'Lebanon')) throw userError('This coupon is for first orders only')
    // "Once per customer" codes: this account, email or phone number has not used the code on an order that stands.
    if (coupon?.oncePerCustomer && input.couponCode && await usedCodeBefore(coupon.code, { userId: user?.id, phone: input.phone || input.shippingAddress.phone, email: orderEmail }, settings['store.country'] || 'Lebanon')) throw userError('You have already used this code')
    // A friend's invite code (lib/invites.ts): new customers only, and not the inviter's own.
    if (coupon?.invite) await checkInvite(coupon.invite, { phone: input.phone || input.shippingAddress.phone, email: orderEmail, userId: user?.id }, settings['store.country'] || 'Lebanon')
    const discountedSubtotal = Math.max(0, subtotal - discount.total)
    // Free gift above an amount (lib/free-gift.ts): added at 0 after the prices are worked out, so
    // no discount, bundle or tax ever counts it; reserved below with the other items.
    const freeGift = await freeGiftFor(subtotal).catch(() => null)
    if (freeGift) {
      if (!byId.has(freeGift.product.id)) byId.set(freeGift.product.id, freeGift.product as any)
      normalized.push(freeGift.line)
    }
    const requestedCoins = Math.max(0, Number(input.coinsToUse || 0))
    if (requestedCoins > discountedSubtotal && requestedCoins > 0) throw userError('Coin redemption exceeds the merchandise total.')
    const orderCurrency = await getStoreCurrency()
    let giftCard: { id: string; balance: number } | null = null
    if (input.giftCardCode) {
      const found = await db.giftCard.findUnique({ where: { code: input.giftCardCode.toUpperCase() } })
      if (!found) throw userError('Invalid gift card code')
      const problem = giftCardProblem(found, orderCurrency)
      if (problem) throw userError(problem)
      giftCard = found
    }
    // The figures the price summary showed (app/api/checkout/quote/route.ts): coins, delivery on the merchandise
    // before them (coins count toward the free-delivery threshold), tax, then the gift card against the final total.
    const { coinDiscount, shipping, shippingTotal, freeShippingDiscount, taxTotal, giftCardDiscount, grandTotal } = await orderMoney({
      discountedSubtotal, taxableSubtotal, discountTaxable: discount.taxable, coinsApplied: requestedCoins,
      requiresShipping: requiresPhysicalShipping, freeShipping: coupon?.type === 'FREE_SHIPPING',
      shippingFor: basis => calculateShipping(input.shippingAddress.country, basis, input.shippingRateId || null, input.shippingAddress.region || null),
      taxRatePercent: await getTaxRatePercent(input.shippingAddress.country),
      giftCardBalance: giftCard ? giftCard.balance : null,
    })
    // The total the shopper reviewed. A retry of an order already placed under this key is answered
    // with that order below, so it is not refused here even if prices have moved since.
    if (input.expectedTotal !== undefined && input.expectedTotal !== grandTotal && !(idempotencyKey && await db.paymentTransaction.findFirst({ where: { provider: 'checkout', externalId: idempotencyKey }, select: { id: true } }))) {
      return json({ error: 'Your total has changed since you reviewed it. Check the new total and place the order again.', code: 'TOTAL_CHANGED', total: grandTotal }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    const orderNumber = await nextOrderNumber()
    // The language the shopper is using: the order's emails and WhatsApp messages are written in it.
    const lang = await shopperLang()
    const fingerprint = checkoutFingerprint(user?.id ?? null, input, merged)

    // Wallet and coin balances move in this transaction, so it must run for real: see lib/prisma.ts.
    const spendsWalletOrCoins = Boolean((user?.id && requestedCoins > 0) || (paymentMethod === PaymentMethod.WALLET && grandTotal > 0))
    const result = await db.$transaction(async tx => {
      if (idempotencyKey) {
        await lockIdempotencyKey(tx, idempotencyKey)
        const existing = await tx.paymentTransaction.findFirst({ where: { provider: 'checkout', externalId: idempotencyKey }, include: { order: true } })
        if (existing?.order) {
          let existingFingerprint: string | null = null
          if (existing.rawJson) {
            try {
              const parsed = JSON.parse(existing.rawJson) as { fingerprint?: unknown }
              existingFingerprint = typeof parsed.fingerprint === 'string' ? parsed.fingerprint : null
            } catch { existingFingerprint = null }
          }
          if (existingFingerprint && existingFingerprint !== fingerprint) throw userError('This idempotency key was already used for a different checkout')
          return { existing: true as const, order: existing.order }
        }
      }

      if (coupon?.firstOrderOnly && user?.id) {
        const existingOrder = await tx.order.findFirst({ where: { userId: user.id, status: { not: 'CANCELLED' } }, select: { id: true } })
        if (existingOrder) throw userError('This coupon is for first orders only')
      }

      // Each write below is matched by an undo, run if a later step fails (stock taken by another
      // shopper, coupon or gift card used up meanwhile, ...). The store's database client runs
      // these steps one by one rather than as one all-or-nothing unit (lib/prisma.ts), so without
      // this a failed checkout kept the customer's coins or wallet money and left stock reserved
      // with no order to ever release it.
      const undo: Array<() => Promise<unknown>> = []
      try {
        if (user?.id && spendsWalletOrCoins) {
          // Wallet/coin balances are a running sum over an append-only ledger, not a single
          // mutable row like coupon.usedCount or giftCard.balance below -- there's no field to
          // put a WHERE-bounded guard on, so a plain "read the sum, then create a debit row" is a
          // check-then-act race: two concurrent checkouts (double-click, two tabs, a retry) can
          // both read the balance before either commits its debit and both pass, double-spending
          // the same balance. Writing to the user's own document first turns that race into a
          // real MongoDB write conflict -- two transactions touching the same document can't both
          // commit, so the loser aborts (surfaced as the generic "please try again" 500 below)
          // instead of silently letting both debits through. (That protection only holds when
          // $transaction runs as a real database transaction -- see lib/prisma.ts.)
          await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } })
        }

        if (user?.id && requestedCoins > 0) {
          const coinAggregate = await tx.coinTransaction.aggregate({ where: { userId: user.id }, _sum: { amount: true } })
          const coinBalance = Math.max(0, Number(coinAggregate._sum.amount || 0))
          if (requestedCoins > coinBalance) throw userError('Insufficient coin balance.')
          await tx.coinTransaction.create({ data: { id: `coin_${user.id}_${orderNumber}_redemption`, userId: user.id, amount: -requestedCoins, type: 'REDEMPTION', reason: 'Checkout coin redemption', referenceId: orderNumber } })
          undo.push(() => tx.coinTransaction.deleteMany({ where: { id: `coin_${user.id}_${orderNumber}_redemption` } }))
        }

        if (paymentMethod === PaymentMethod.WALLET && grandTotal > 0) {
          const walletAggregate = await tx.walletTransaction.aggregate({ where: { userId: user!.id, currency: orderCurrency }, _sum: { amount: true } })
          const walletBalance = Number(walletAggregate._sum.amount || 0)
          if (walletBalance < grandTotal) throw userError('Insufficient wallet balance.')
          await tx.walletTransaction.create({ data: { id: `wal_${user!.id}_${orderNumber}_payment`, userId: user!.id, amount: -grandTotal, currency: orderCurrency, type: 'PAYMENT', reason: 'Wallet checkout payment', referenceId: orderNumber } })
          undo.push(() => tx.walletTransaction.deleteMany({ where: { id: `wal_${user!.id}_${orderNumber}_payment` } }))
        }

        for (const item of normalized) {
          const reserved = await reserveStock(tx, byId.get(item.productId)!, item.variantId, item.quantity, orderNumber)
          if (reserved.length) undo.push(() => undoReservations(tx, reserved, orderNumber, 'Checkout failed before the order was placed'))
        }
        // Invite codes are not discounts in Discounts: nothing to count (lib/invites.ts).
        if (coupon?.id && !coupon.invite) {
          const couponUpdate = await tx.coupon.updateMany({ where: { id: coupon.id, isActive: true, ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}) }, data: { usedCount: { increment: 1 } } })
          if (couponUpdate.count !== 1) throw userError('This coupon is no longer available')
          undo.push(() => tx.coupon.updateMany({ where: { id: coupon.id, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } }))
        }
        if (giftCard && giftCardDiscount > 0) {
          const giftCardUpdate = await tx.giftCard.updateMany({ where: { id: giftCard.id, status: 'ACTIVE', balance: { gte: giftCardDiscount } }, data: { balance: { decrement: giftCardDiscount } } })
          if (giftCardUpdate.count !== 1) throw userError('This gift card is no longer available')
          undo.push(() => tx.giftCard.updateMany({ where: { id: giftCard!.id }, data: { balance: { increment: giftCardDiscount } } }))
        }

        const paidByWallet = paymentMethod === PaymentMethod.WALLET
        // Coins or a gift card can cover the entire total on their own -- in that case there's
        // nothing left for CARD to charge, so the order is treated as paid upfront
        // just like WALLET, and the CARD provider round-trip is skipped below.
        const paidUpfront = paidByWallet || grandTotal === 0
        const coveredBy = [coinDiscount > 0 ? 'coins' : '', giftCardDiscount > 0 ? 'a gift card' : ''].filter(Boolean).join(' and ')
        const orderStatus = paidUpfront ? 'CONFIRMED' : 'PENDING'
        const paymentStatus = paidUpfront ? 'PAID' : 'UNPAID'
        const checkoutTxRaw: Record<string, unknown> = { coinDiscount, coinsUsed: requestedCoins }
        if (idempotencyKey) checkoutTxRaw.fingerprint = fingerprint
        if (giftCard && giftCardDiscount > 0) { checkoutTxRaw.giftCardId = giftCard.id; checkoutTxRaw.giftCardAmount = giftCardDiscount }
        if (bundles.applied.length) checkoutTxRaw.bundles = bundles.applied
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: user?.id ?? null,
            email: orderEmail,
            phone: input.phone || null,
            whatsappUpdates: input.whatsappUpdates === true,
            lang,
            adConsent: input.adConsent || null,
            ...orderRecordTotals(subtotal, discount.total, { coinDiscount, shipping, shippingTotal, freeShippingDiscount, taxTotal, giftCardDiscount, grandTotal }),
            currency: orderCurrency,
            status: orderStatus,
            paymentStatus,
            paymentMethod,
            shippingAddressJson: JSON.stringify(input.shippingAddress),
            couponCode: coupon?.code ?? null,
            shippingMethod: shipping.method,
            isGift: input.isGift === true,
            giftMessage: input.isGift && input.giftMessage ? input.giftMessage : null,
            items: { create: normalized.map(({ taxable: _taxable, ...item }) => item) },
            events: { create: { status: orderStatus, message: paidByWallet ? `Order placed using wallet${coinDiscount ? ` and ${requestedCoins} coins` : ''}.` : paidUpfront ? `Order placed successfully${coveredBy ? ` using ${coveredBy}` : ''}.` : 'Order placed successfully.' } },
            paymentTransactions: { create: { provider: 'checkout', externalId: idempotencyKey, status: paidUpfront ? 'paid' : 'created', amount: grandTotal, currency: orderCurrency, rawJson: JSON.stringify(checkoutTxRaw) } },
          },
        })
        return { existing: false as const, order }
      } catch (error) {
        for (const step of undo.reverse()) await step().catch(undoError => console.error('[checkout] undo step failed', undoError))
        throw error
      }
    }, { requireTransaction: spendsWalletOrCoins } as any)

    if (result.existing) {
      const providerTx = paymentMethod === PaymentMethod.CARD
        ? await db.paymentTransaction.findFirst({ where: { orderId: result.order.id, provider: paymentProvider.name }, orderBy: { createdAt: 'desc' } })
        : null
      return json({ order: { id: result.order.id, orderNumber: result.order.orderNumber, total: result.order.grandTotal, successPath: orderSuccessPath(result.order.orderNumber) }, payment: providerCheckout(providerTx?.rawJson || null) }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
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
        // The cancellation and the coins and gift card that come back with it are one transaction. If it cannot run,
        // nothing is cancelled, and the expired-reservation job clears the order later.
        await db.$transaction(async tx => {
          await releaseOrderReservations(tx, order.id, 'Online payment initialization failed')
          if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
          await restoreCheckoutCoins(tx, order.id, order.userId)
          await restoreCheckoutGiftCard(tx, order.id, order.grandTotal)
          await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', fulfillmentStatus: 'UNFULFILLED', events: { create: { status: 'CANCELLED', message: 'Online payment initialization failed.' } } } })
        }, { requireTransaction: true } as any)
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
    // A number that refused a parcel before says so in the notification (lib/order-risk.ts).
    runInBackground(riskNote(order.id, settings['store.country'] || 'Lebanon').catch(() => '')
      .then(note => sendNewOrderPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }, note))
      .catch(error => console.error('[push] new-order notification failed', error)))
    // The owner confirms cash and transfer orders: watch this one, so a reminder comes if it waits too long.
    if (paymentMethod !== PaymentMethod.CARD) runInBackground(armOrderWatch())
    // A card checkout holds stock until it is paid: the hourly job that releases abandoned ones runs while one waits.
    else runInBackground(armHourlyJobs())
    if (paymentMethod !== PaymentMethod.CARD || order.grandTotal === 0) {
      runInBackground(sendOrderConfirmationEmail(order.id).catch(error => console.error('[email] order confirmation failed', error)))
      // Report the sale to Meta from the server too (card orders are reported once paid).
      runInBackground(sendMetaPurchase(order.id, { context: adContextFromRequest(req), storeUrl: new URL(req.url).origin }))
    }
    // Close this shopper's open checkouts now, so no cart reminder can follow a real order,
    // then run the throttled reminder check while the database is awake.
    const phoneKey = internationalPhone(input.phone || input.shippingAddress.phone, settings['store.country'])
    if (order.email || phoneKey) runInBackground(markCheckoutsRecovered(order.email, phoneKey).catch(error => console.error('[cart-reminders] could not close checkouts', error)).then(() => maybeSendCartReminders(sendAbandonedCheckoutEmail)))
    runInBackground(dispatchWebhookEvent('order.created', { id: order.id, orderNumber: order.orderNumber, email: order.email, grandTotal: order.grandTotal, currency: order.currency, status: order.status, paymentStatus: order.paymentStatus }).catch(error => console.error('[webhook] order.created dispatch failed', error)))
    await audit(user?.id, 'order.created', 'Order', order.id, { orderNumber: order.orderNumber, total: grandTotal, paymentMethod, paymentProvider: paymentMethod === PaymentMethod.CARD ? paymentProvider.name : paymentMethod.toLowerCase(), coinsUsed: requestedCoins, coinDiscount, giftCardAmount: giftCardDiscount })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.grandTotal, successPath: orderSuccessPath(order.orderNumber) }, payment: clientCheckout, rewards: { coinsUsed: requestedCoins, coinDiscount, giftCardAmount: giftCardDiscount } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const failure = checkoutFailure(error)
    // An unexpected failure on a customer's order: tell the owner now (throttled, no personal details).
    if (failure.status >= 500) runInBackground(alertCheckoutFailure(error))
    return json({ error: failure.message }, { status: failure.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
