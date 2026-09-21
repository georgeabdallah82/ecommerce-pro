import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeReturnItems, remainingRefundable, pickRefundSource, classifyOrderEditPaymentAdjustment, recomputeOrderEditTotals, type ReturnableOrder } from '@/lib/returns'

function order(overrides: Partial<ReturnableOrder> = {}): ReturnableOrder {
  return {
    id: 'order_1', orderNumber: 'ORD-1', userId: 'user_1', status: 'DELIVERED', paymentStatus: 'PAID',
    grandTotal: 10000, currency: 'USD', updatedAt: new Date(), paymentMethod: 'CARD',
    items: [{ id: 'item_1', name: 'Widget', productId: 'prod_1', variantId: null, quantity: 3 }],
    paymentTransactions: [],
    ...overrides,
  }
}

describe('lib/returns normalizeReturnItems', () => {
  it('normalizes and dedupes repeated lines for the same item', () => {
    const normalized = normalizeReturnItems(order(), [{ orderItemId: 'item_1', quantity: 1 }, { orderItemId: 'item_1', quantity: 1 }], new Map())
    assert.equal(normalized.length, 1)
    assert.equal(normalized[0].quantity, 2)
  })

  it('rejects an unknown order item', () => {
    assert.throws(() => normalizeReturnItems(order(), [{ orderItemId: 'missing', quantity: 1 }], new Map()), /was not found/)
  })

  it('rejects a non-positive or non-integer quantity', () => {
    assert.throws(() => normalizeReturnItems(order(), [{ orderItemId: 'item_1', quantity: 0 }], new Map()), /Invalid return quantity/)
    assert.throws(() => normalizeReturnItems(order(), [{ orderItemId: 'item_1', quantity: 1.5 }], new Map()), /Invalid return quantity/)
  })

  it('rejects a quantity that exceeds what was purchased', () => {
    assert.throws(() => normalizeReturnItems(order(), [{ orderItemId: 'item_1', quantity: 4 }], new Map()), /exceeds the quantity purchased/)
  })

  it('accounts for quantities already claimed by other returns', () => {
    assert.throws(() => normalizeReturnItems(order(), [{ orderItemId: 'item_1', quantity: 2 }], new Map([['item_1', 2]])), /exceeds the quantity purchased/)
    const normalized = normalizeReturnItems(order(), [{ orderItemId: 'item_1', quantity: 1 }], new Map([['item_1', 2]]))
    assert.equal(normalized[0].quantity, 1)
  })

  it('rejects an empty item list', () => {
    assert.throws(() => normalizeReturnItems(order(), [], new Map()), /At least one return item is required/)
  })
})

describe('lib/returns remainingRefundable', () => {
  it('returns the full grand total when nothing has been refunded', () => {
    assert.equal(remainingRefundable(order()), 10000)
  })

  it('subtracts refunded and partially_refunded transactions', () => {
    const refundable = remainingRefundable(order({ paymentTransactions: [
      { id: 't1', status: 'refunded', amount: 3000, provider: 'areeba_mpgs', externalId: 'ext_1', createdAt: new Date(), rawJson: null },
      { id: 't2', status: 'paid', amount: 10000, provider: 'areeba_mpgs', externalId: 'ext_1', createdAt: new Date(), rawJson: null },
    ] }))
    assert.equal(refundable, 7000)
  })

  it('never goes negative', () => {
    const refundable = remainingRefundable(order({ paymentTransactions: [
      { id: 't1', status: 'refunded', amount: 20000, provider: 'areeba_mpgs', externalId: 'ext_1', createdAt: new Date(), rawJson: null },
    ] }))
    assert.equal(refundable, 0)
  })
})

describe('lib/returns pickRefundSource', () => {
  it('falls back to manual when there is no captured payment', () => {
    assert.deepEqual(pickRefundSource(order()), { refundProvider: 'manual', refundExternalId: null })
  })

  it('ignores manual-provider and non-captured transactions', () => {
    const result = pickRefundSource(order({ paymentTransactions: [
      { id: 't1', status: 'paid', amount: 10000, provider: 'manual', externalId: 'ext_manual', createdAt: new Date(), rawJson: null },
      { id: 't2', status: 'pending', amount: 10000, provider: 'areeba_mpgs', externalId: 'ext_pending', createdAt: new Date(), rawJson: null },
    ] }))
    assert.deepEqual(result, { refundProvider: 'manual', refundExternalId: null })
  })

  it('picks the most recent captured/authorized/paid transaction with an external id', () => {
    const older = new Date('2024-01-01')
    const newer = new Date('2024-06-01')
    const result = pickRefundSource(order({ paymentTransactions: [
      { id: 't1', status: 'paid', amount: 10000, provider: 'areeba_mpgs', externalId: 'ext_old', createdAt: older, rawJson: null },
      { id: 't2', status: 'captured', amount: 10000, provider: 'areeba_mpgs', externalId: 'ext_new', createdAt: newer, rawJson: null },
    ] }))
    assert.deepEqual(result, { refundProvider: 'areeba_mpgs', refundExternalId: 'ext_new' })
  })

  it('routes a wallet-paid order to the wallet, never the checkout bookkeeping transaction', () => {
    // Wallet checkouts only ever have the internal `provider: 'checkout'` row (see
    // app/api/checkout/route.ts) -- treating that as a real gateway is exactly the bug this
    // guards against (it isn't a provider getPaymentProvider() recognizes for refunds).
    const result = pickRefundSource(order({ paymentMethod: 'WALLET', paymentTransactions: [
      { id: 't1', status: 'paid', amount: 10000, provider: 'checkout', externalId: 'idem_1', createdAt: new Date(), rawJson: null },
    ] }))
    assert.deepEqual(result, { refundProvider: 'wallet', refundExternalId: null })
  })
})

describe('lib/returns classifyOrderEditPaymentAdjustment', () => {
  it('returns null when the total did not change', () => {
    assert.equal(classifyOrderEditPaymentAdjustment('PAID', 0), null)
  })

  it('returns null when the order was never actually paid', () => {
    assert.equal(classifyOrderEditPaymentAdjustment('PENDING', -500), null)
    assert.equal(classifyOrderEditPaymentAdjustment('UNPAID', 500), null)
    assert.equal(classifyOrderEditPaymentAdjustment('FAILED', 500), null)
  })

  it('classifies a total decrease on a paid order as a refund owed', () => {
    assert.deepEqual(classifyOrderEditPaymentAdjustment('PAID', -1200), { type: 'refund', amount: 1200 })
  })

  it('classifies a total increase on a paid order as a charge due', () => {
    assert.deepEqual(classifyOrderEditPaymentAdjustment('PAID', 800), { type: 'charge', amount: 800 })
  })

  it('also reconciles on an order that has already been partially refunded', () => {
    assert.deepEqual(classifyOrderEditPaymentAdjustment('PARTIALLY_REFUNDED', -300), { type: 'refund', amount: 300 })
    assert.deepEqual(classifyOrderEditPaymentAdjustment('PARTIALLY_REFUNDED', 300), { type: 'charge', amount: 300 })
  })
})

describe('lib/returns recomputeOrderEditTotals', () => {
  it('applies tax to the full new subtotal when every item is taxable and there is no discount', () => {
    const result = recomputeOrderEditTotals({ nextSubtotal: 10000, nextTaxableSubtotal: 10000, discountTotal: 0, shippingTotal: 500, taxRatePercent: 10 })
    assert.deepEqual(result, { taxTotal: 1000, grandTotal: 11500 })
  })

  it('charges zero tax on a fully tax-exempt subtotal', () => {
    const result = recomputeOrderEditTotals({ nextSubtotal: 10000, nextTaxableSubtotal: 0, discountTotal: 0, shippingTotal: 0, taxRatePercent: 20 })
    assert.deepEqual(result, { taxTotal: 0, grandTotal: 10000 })
  })

  it('prorates the discount across taxable/non-taxable items before taxing the remainder', () => {
    // Half the subtotal is taxable ($50 of $100); a flat $20 discount is split proportionally,
    // leaving $40 of taxable amount, taxed at 10% = $4.
    const result = recomputeOrderEditTotals({ nextSubtotal: 10000, nextTaxableSubtotal: 5000, discountTotal: 2000, shippingTotal: 0, taxRatePercent: 10 })
    assert.deepEqual(result, { taxTotal: 400, grandTotal: 8400 })
  })

  it('clamps the taxable-after-discount amount at zero when the discount exceeds it', () => {
    const result = recomputeOrderEditTotals({ nextSubtotal: 10000, nextTaxableSubtotal: 1000, discountTotal: 10000, shippingTotal: 0, taxRatePercent: 10 })
    assert.deepEqual(result, { taxTotal: 0, grandTotal: 0 })
  })

  it('returns a zero taxable share when the new subtotal is zero (every item removed)', () => {
    const result = recomputeOrderEditTotals({ nextSubtotal: 0, nextTaxableSubtotal: 0, discountTotal: 500, shippingTotal: 500, taxRatePercent: 10 })
    assert.deepEqual(result, { taxTotal: 0, grandTotal: 0 })
  })

  it('keeps discount and shipping as fixed absolute amounts, unaffected by the tax rate', () => {
    const result = recomputeOrderEditTotals({ nextSubtotal: 20000, nextTaxableSubtotal: 20000, discountTotal: 3000, shippingTotal: 700, taxRatePercent: 0 })
    assert.deepEqual(result, { taxTotal: 0, grandTotal: 17700 })
  })
})
