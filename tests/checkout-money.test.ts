import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { NO_SHIPPING, orderMoney, orderRecordTotals, type OrderMoneyInput } from '@/lib/checkout-totals'
import { refundOutcome } from '@/lib/refund-reconciliation'

// An order's money (docs/money-tests-2026-11.md): what checkout charges, what the order keeps, and how a refund the
// payment gateway made is settled.
const delivery = (total: number) => async () => ({ total, method: 'Standard', estimatedDays: 2 })
const base: OrderMoneyInput = {
  discountedSubtotal: 10000, taxableSubtotal: 10000, discountTaxable: 0, coinsApplied: 0, requiresShipping: true,
  freeShipping: false, shippingFor: delivery(500), taxRatePercent: 0, giftCardBalance: null,
}
const money = (over: Partial<OrderMoneyInput> = {}) => orderMoney({ ...base, ...over })

describe('what checkout charges (orderMoney)', () => {
  it('merchandise, then delivery, then tax', async () => {
    const m = await money({ taxRatePercent: 11 })
    assert.equal(m.shippingTotal, 500)
    assert.equal(m.taxTotal, 1100)
    assert.equal(m.grandTotal, 11600)
  })
  it('tax is rounded to the nearest cent, and only on what is taxable', async () => {
    assert.equal((await money({ discountedSubtotal: 3333, taxableSubtotal: 3333, taxRatePercent: 11 })).taxTotal, 367) // 366.63
    assert.equal((await money({ discountedSubtotal: 1050, taxableSubtotal: 1050, taxRatePercent: 10 })).taxTotal, 105)
    assert.equal((await money({ taxableSubtotal: 0, taxRatePercent: 11 })).taxTotal, 0)
    // Half the cart taxable, 1,000 of discount on it: tax on 4,000.
    assert.equal((await money({ discountedSubtotal: 9000, taxableSubtotal: 5000, discountTaxable: 1000, taxRatePercent: 10 })).taxTotal, 400)
  })
  it('coins come off the merchandise, never more than it, and delivery is priced before them', async () => {
    let pricedOn = -1
    const m = await money({ coinsApplied: 2500, shippingFor: async basis => { pricedOn = basis; return { total: 500, method: 'Standard', estimatedDays: null } } })
    assert.equal(pricedOn, 10000)
    assert.equal(m.coinDiscount, 2500)
    assert.equal(m.grandTotal, 8000)
    assert.equal((await money({ coinsApplied: 50000 })).coinDiscount, 10000)
    assert.equal((await money({ coinsApplied: -300 })).coinDiscount, 0)
  })
  it('a free-delivery code charges no delivery', async () => {
    const m = await money({ freeShipping: true })
    assert.equal(m.shippingTotal, 0)
    assert.equal(m.freeShippingDiscount, 500)
    assert.equal(m.grandTotal, 10000)
  })
  it('with nothing to deliver, delivery is not priced at all', async () => {
    let asked = false
    const m = await money({ requiresShipping: false, shippingFor: async () => { asked = true; return { total: 500, method: 'x', estimatedDays: null } } })
    assert.equal(asked, false)
    assert.deepEqual(m.shipping, NO_SHIPPING)
    assert.equal(m.grandTotal, 10000)
  })
  it('a gift card pays after delivery and tax, up to the total, and never below zero', async () => {
    const part = await money({ taxRatePercent: 10, giftCardBalance: 3000 })
    assert.equal(part.giftCardDiscount, 3000)
    assert.equal(part.grandTotal, 10000 + 500 + 1000 - 3000)
    const all = await money({ taxRatePercent: 10, giftCardBalance: 50000 })
    assert.equal(all.giftCardDiscount, 11500)
    assert.equal(all.grandTotal, 0)
    assert.equal((await money({ giftCardBalance: 0 })).giftCardDiscount, 0)
  })
})

describe('what the order keeps (orderRecordTotals)', () => {
  it('adds up as subtotal - discount + delivery + tax = total, whatever the order used', async () => {
    const subtotal = 10000
    for (const merchandise of [0, 990, 10000]) for (const freeShipping of [false, true]) for (const coinsApplied of [0, 1500])
      for (const giftCardBalance of [null, 2000, 99999]) for (const taxRatePercent of [0, 11]) {
        const m = await money({ discountedSubtotal: subtotal - merchandise, discountTaxable: merchandise, coinsApplied, freeShipping, giftCardBalance, taxRatePercent })
        const kept = orderRecordTotals(subtotal, merchandise, m)
        const label = JSON.stringify({ merchandise, freeShipping, coinsApplied, giftCardBalance, taxRatePercent, kept })
        assert.equal(kept.subtotal - kept.discountTotal + kept.shippingTotal + kept.taxTotal, kept.grandTotal, label)
        assert.equal(kept.grandTotal, m.grandTotal, label)
        assert.ok(kept.discountTotal >= 0 && kept.grandTotal >= 0, label)
      }
  })
  it('a free-delivery code is kept as no delivery charge, not also as a discount (it was counted in both)', async () => {
    const kept = orderRecordTotals(9900, 0, await money({ discountedSubtotal: 9900, taxableSubtotal: 9900, freeShipping: true }))
    assert.deepEqual(kept, { subtotal: 9900, discountTotal: 0, shippingTotal: 0, taxTotal: 0, grandTotal: 9900 })
  })
  it('checkout keeps these figures', () => {
    const checkout = readFileSync('app/api/checkout/route.ts', 'utf8')
    assert.match(checkout, /\.\.\.orderRecordTotals\(subtotal, discount\.total, \{ coinDiscount, shipping, shippingTotal, freeShippingDiscount, taxTotal, giftCardDiscount, grandTotal \}\)/)
    assert.doesNotMatch(checkout, /discountTotal: discount\.total \+ freeShippingDiscount/)
  })
})

describe('how a refund the gateway made is settled (refundOutcome)', () => {
  const settle = (over: Partial<Parameters<typeof refundOutcome>[0]>) => refundOutcome({ gatewayStatus: 'REFUNDED', gatewayRefunded: 0, alreadyRefunded: 0, pendingAmount: 0, grandTotal: 9900, ...over })
  it('only once the gateway says the payment was refunded', () => {
    assert.deepEqual(settle({ gatewayStatus: 'CAPTURED', gatewayRefunded: 99 }), { settle: false })
  })
  it('the whole total is a refund; less is a partial refund', () => {
    assert.deepEqual(settle({ gatewayRefunded: 99 }), { settle: true, refundedMinor: 9900, paymentStatus: 'REFUNDED' })
    assert.deepEqual(settle({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 25.5 }), { settle: true, refundedMinor: 2550, paymentStatus: 'PARTIALLY_REFUNDED' })
  })
  it('the gateway\'s amount in dollars becomes exact cents', () => {
    assert.deepEqual(settle({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 19.99 }), { settle: true, refundedMinor: 1999, paymentStatus: 'PARTIALLY_REFUNDED' })
    assert.deepEqual(settle({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 0.1 + 0.2 }), { settle: true, refundedMinor: 30, paymentStatus: 'PARTIALLY_REFUNDED' })
  })
  it('waits while the gateway has refunded less than the store already counts, and ignores an amount that is not a number', () => {
    assert.deepEqual(settle({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 20, alreadyRefunded: 1500, pendingAmount: 1000 }), { settle: false })
    assert.deepEqual(settle({ gatewayRefunded: Number.NaN }), { settle: false })
  })
})
