import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NO_SHIPPING, orderMoney, type OrderMoneyInput } from '../lib/checkout-totals'
import { giftCardProblem } from '../lib/gift-cards'
import { checkoutSchema } from '../lib/validation'

const read = (path: string) => readFileSync(path, 'utf8')

// Delivery like the seeded "Standard delivery" rate: 5.00, free from 100.00 (minor units).
const rate = async (basis: number) => ({ total: basis >= 10000 ? 0 : 500, method: 'Standard delivery', estimatedDays: 3 })

// A 198.00 cart, with the free-delivery threshold at 100.00. Coins count toward that threshold (docs/owner-decisions-2026-11.md).
const money = (over: Partial<OrderMoneyInput> = {}) => orderMoney({
  discountedSubtotal: 19800, taxableSubtotal: 19800, discountTaxable: 0, coinsApplied: 0,
  requiresShipping: true, freeShipping: false, shippingFor: rate, taxRatePercent: 0, giftCardBalance: null,
  ...over,
})

test('no coins: a cart over the free-delivery threshold pays no delivery', async () => {
  const m = await money()
  assert.equal(m.shippingTotal, 0)
  assert.equal(m.grandTotal, 19800)
})

test('coins count toward the free-delivery threshold: a cart that reaches it pays no delivery, even when coins pay for part of it', async () => {
  const m = await money({ coinsApplied: 10000 })
  assert.equal(m.coinDiscount, 10000)
  assert.equal(m.shippingTotal, 0)
  assert.equal(m.grandTotal, 9800)
})

test('a cart under the threshold pays delivery whatever coins it uses', async () => {
  const m = await money({ discountedSubtotal: 9000, taxableSubtotal: 9000, coinsApplied: 9000 })
  assert.equal(m.shippingTotal, 500)
  assert.equal(m.grandTotal, 500)
})

test('delivery is priced on the merchandise before coins', async () => {
  let basis = -1
  await money({ coinsApplied: 10000, shippingFor: async merchandise => { basis = merchandise; return rate(merchandise) } })
  assert.equal(basis, 19800)
})

test('a FREE_SHIPPING coupon waives the delivery charge and reports what it saved', async () => {
  // Under the threshold, so the coupon has a charge to waive: 90.00 of merchandise, 10.00 paid in coins.
  const m = await money({ discountedSubtotal: 9000, taxableSubtotal: 9000, coinsApplied: 1000, freeShipping: true })
  assert.equal(m.shippingTotal, 0)
  assert.equal(m.freeShippingDiscount, 500)
  assert.equal(m.grandTotal, 8000)
})

test('tax is worked out on what the coins leave taxable', async () => {
  // Taxable 19800 less the coins' share (10000) leaves 9800; 10% of that is 980. The cart is over the threshold: no delivery.
  const m = await money({ coinsApplied: 10000, taxRatePercent: 10 })
  assert.equal(m.taxTotal, 980)
  assert.equal(m.grandTotal, 9800 + 0 + 980)
})

test('a gift card pays the final total, after delivery and tax, and never more than that total', async () => {
  const partial = await money({ coinsApplied: 10000, giftCardBalance: 5000 })
  assert.equal(partial.giftCardDiscount, 5000)
  assert.equal(partial.grandTotal, 9800 - 5000)
  const covers = await money({ coinsApplied: 10000, giftCardBalance: 50000 })
  assert.equal(covers.giftCardDiscount, 9800)
  assert.equal(covers.grandTotal, 0)
})

test('a cart with nothing to deliver is not charged delivery and does not ask for a rate', async () => {
  let asked = false
  const m = await money({ requiresShipping: false, shippingFor: async basis => { asked = true; return rate(basis) } })
  assert.equal(asked, false)
  assert.deepEqual(m.shipping, NO_SHIPPING)
  assert.equal(m.grandTotal, 19800)
})

test('coins above the merchandise are capped in the arithmetic (the routes refuse them first)', async () => {
  const m = await money({ coinsApplied: 30000 })
  assert.equal(m.coinDiscount, 19800)
  assert.equal(m.shippingTotal, 0)
  assert.equal(m.grandTotal, 0)
})

test('a gift card is refused with the same reason at checkout and in the summary', () => {
  const base = { status: 'ACTIVE', expiresAt: null, balance: 5000, currency: 'USD' }
  assert.equal(giftCardProblem(base, 'USD'), null)
  assert.equal(giftCardProblem({ ...base, status: 'DISABLED' }, 'USD'), 'This gift card is no longer active')
  assert.equal(giftCardProblem({ ...base, expiresAt: new Date(Date.now() - 1000) }, 'USD'), 'This gift card has expired')
  assert.equal(giftCardProblem({ ...base, balance: 0 }, 'USD'), 'This gift card has no remaining balance')
  assert.equal(giftCardProblem(base, 'LBP'), 'This gift card cannot be used for this order currency')
})

test('the checkout schema takes the total the shopper reviewed, and nothing negative', () => {
  const body = { paymentMethod: 'COD', items: [{ productId: 'p1', quantity: 1 }], shippingAddress: { country: 'Lebanon' } }
  assert.equal(checkoutSchema.parse({ ...body, expectedTotal: 10300 }).expectedTotal, 10300)
  assert.equal(checkoutSchema.parse(body).expectedTotal, undefined)
  assert.throws(() => checkoutSchema.parse({ ...body, expectedTotal: -1 }))
})

test('checkout and the price summary both price the order through orderMoney', () => {
  const checkout = read('app/api/checkout/route.ts')
  const quote = read('app/api/checkout/quote/route.ts')
  assert.match(checkout, /await orderMoney\(\{/)
  assert.match(quote, /await orderMoney\(\{/)
  // The arithmetic lives in one place: neither route does its own tax or gift card maths any more.
  assert.doesNotMatch(checkout, /taxableAmountAfterRewards\(/)
  assert.doesNotMatch(quote, /taxableAmountAfterRewards\(/)
  assert.doesNotMatch(checkout, /giftCardDiscount = Math\.min/)
})

test('checkout refuses an order at a total the shopper did not see, with a code the page can act on', () => {
  const checkout = read('app/api/checkout/route.ts')
  assert.match(checkout, /input\.expectedTotal !== undefined && input\.expectedTotal !== grandTotal/)
  assert.match(checkout, /code: 'TOTAL_CHANGED', total: grandTotal \}, \{ status: 409/)
  // Checked before the order number is taken, so a refused attempt uses no number.
  assert.ok(checkout.indexOf("code: 'TOTAL_CHANGED'") < checkout.indexOf('const orderNumber = await nextOrderNumber()'))
})

test('requests that share an idempotency key queue on a lock before the existing order is looked up', () => {
  const checkout = read('app/api/checkout/route.ts')
  assert.match(checkout, /SELECT pg_advisory_xact_lock\(hashtext\(/)
  const lock = checkout.indexOf('await lockIdempotencyKey(tx, idempotencyKey)')
  const lookup = checkout.indexOf("const existing = await tx.paymentTransaction.findFirst({ where: { provider: 'checkout', externalId: idempotencyKey }")
  assert.ok(lock > 0 && lookup > lock, 'the lock is taken first, inside the transaction')
})

test('the price summary and the payment callbacks use durable rate limits', () => {
  assert.match(read('app/api/checkout/quote/route.ts'), /await consumeDurableRateLimit\(`checkout-quote:/)
  assert.doesNotMatch(read('app/api/checkout/quote/route.ts'), /consumeRateLimit\(/)
  assert.match(read('app/api/payments/areeba/webhook/route.ts'), /await consumeDurableRateLimit\(`areeba-webhook:/)
  assert.match(read('app/api/payments/areeba/return/route.ts'), /await consumeDurableRateLimit\(`areeba-return:/)
})

test('the Place order button shows the server total and waits for a current price', () => {
  const page = read('app/checkout/page.tsx')
  assert.doesNotMatch(page, /quote\.total - coinsToUse/, 'no client-side subtraction of coins from the server total')
  assert.match(page, /expectedTotal: quote\.total/)
  assert.match(page, /code === 'TOTAL_CHANGED'/)
  assert.match(page, /Boolean\(quote\.coinsError \|\| quote\.giftCardError\)/)
})
