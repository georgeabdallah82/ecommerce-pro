import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cashDiscrepancy, checkPayment, expectedShiftCash, isValidIdempotencyKey, lbpFromUsdCents, usdCentsFromLbp } from '../lib/pos-payments'

const RATE = 89500

describe('LBP conversion', () => {
  it('rounds a dollar amount to a whole thousand lira', () => {
    // $1.00 = 89,500 LBP, which rounds to 90,000 (nearest 1,000, half up).
    assert.equal(lbpFromUsdCents(100, RATE), 90000)
    assert.equal(lbpFromUsdCents(1000, RATE), 895000)
    assert.equal(lbpFromUsdCents(0, RATE), 0)
  })

  it('converts LBP back to USD cents, rounded to the cent', () => {
    assert.equal(usdCentsFromLbp(89500, RATE), 100)
    assert.equal(usdCentsFromLbp(895000, RATE), 1000)
  })
})

describe('payment check', () => {
  it('accepts an exact USD cash payment', () => {
    const result = checkPayment({ totalUsdCents: 1250, rateLbp: RATE, lines: [{ method: 'CASH', currency: 'USD', amount: 1250 }] })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.paidUsdCents, 1250)
      assert.equal(result.changeUsdCents, 0)
      assert.equal(result.lines[0].fxRateLbp, null)
    }
  })

  it('takes a split payment and saves the rate used on every LBP line', () => {
    const result = checkPayment({
      totalUsdCents: 1000,
      rateLbp: RATE,
      lines: [
        { method: 'CARD', currency: 'USD', amount: 500 },
        { method: 'CASH', currency: 'LBP', amount: 447500 },
      ],
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lines[1].fxRateLbp, RATE)
      assert.equal(result.lines[1].usdCents, 500)
      assert.equal(result.paidUsdCents, 1000)
    }
  })

  it('gives change back in USD cents when cash overpays', () => {
    const result = checkPayment({ totalUsdCents: 800, rateLbp: RATE, lines: [{ method: 'CASH', currency: 'USD', amount: 1000 }] })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.changeUsdCents, 200)
  })

  it('refuses a payment that does not cover the total', () => {
    const result = checkPayment({ totalUsdCents: 1000, rateLbp: RATE, lines: [{ method: 'CARD', currency: 'USD', amount: 999 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors.join(' '), /do not cover/)
  })

  it('refuses change on a non-cash overpayment', () => {
    const result = checkPayment({ totalUsdCents: 800, rateLbp: RATE, lines: [{ method: 'CARD', currency: 'USD', amount: 1000 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors.join(' '), /Change can only/)
  })

  it('refuses an LBP payment when no exchange rate is set', () => {
    const result = checkPayment({ totalUsdCents: 100, rateLbp: null, lines: [{ method: 'CASH', currency: 'LBP', amount: 90000 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors.join(' '), /exchange rate/)
  })

  it('refuses zero, negative, fractional or missing amounts', () => {
    for (const amount of [0, -5, 12.5, Number.NaN]) {
      const result = checkPayment({ totalUsdCents: 100, rateLbp: RATE, lines: [{ method: 'CASH', currency: 'USD', amount }] })
      assert.equal(result.ok, false, String(amount))
    }
  })

  it('refuses a sale with no payment lines, and an unknown method', () => {
    assert.equal(checkPayment({ totalUsdCents: 100, rateLbp: RATE, lines: [] }).ok, false)
    const unknown = checkPayment({ totalUsdCents: 100, rateLbp: RATE, lines: [{ method: 'CRYPTO' as never, currency: 'USD', amount: 100 }] })
    assert.equal(unknown.ok, false)
  })

  it('refuses an over-long reference', () => {
    const result = checkPayment({ totalUsdCents: 100, rateLbp: RATE, lines: [{ method: 'WHISH', currency: 'USD', amount: 100, reference: 'x'.repeat(65) }] })
    assert.equal(result.ok, false)
  })

  it('accepts Whish and OMT as recorded settlements with a reference', () => {
    const result = checkPayment({ totalUsdCents: 300, rateLbp: RATE, lines: [{ method: 'OMT', currency: 'USD', amount: 300, reference: 'OMT-88213' }] })
    assert.equal(result.ok, true)
  })
})

describe('cash drawer', () => {
  it('expects opening float plus cash sales, minus change, plus cash in, minus cash out', () => {
    assert.equal(
      expectedShiftCash({ openingCents: 20000, cashSalesCents: 15000, changeGivenCents: 500, cashInCents: 3000, cashOutCents: 1000 }),
      36500,
    )
  })

  it('reports a shortage as a negative discrepancy and extra cash as positive', () => {
    assert.equal(cashDiscrepancy(36000, 36500), -500)
    assert.equal(cashDiscrepancy(37000, 36500), 500)
    assert.equal(cashDiscrepancy(36500, 36500), 0)
  })
})

describe('idempotency key', () => {
  it('accepts a long enough token of letters, digits, dashes and underscores', () => {
    assert.equal(isValidIdempotencyKey('sale_2026-11-08_abc123'), true)
  })

  it('refuses short, empty, or unsafe keys', () => {
    assert.equal(isValidIdempotencyKey('abc'), false)
    assert.equal(isValidIdempotencyKey(''), false)
    assert.equal(isValidIdempotencyKey('sale id with spaces'), false)
    assert.equal(isValidIdempotencyKey('x'.repeat(65)), false)
  })
})
