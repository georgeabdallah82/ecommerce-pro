import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkoutSchema, emailSchema, passwordSchema } from '@/lib/validation'

const validAddress = {
  firstName: 'Jane',
  lastName: 'Doe',
  line1: '123 Main St',
  city: 'Beirut',
  country: 'Lebanon',
}

const validCheckout = {
  email: 'jane@example.com',
  paymentMethod: 'COD' as const,
  shippingAddress: validAddress,
  items: [{ productId: 'p1', quantity: 1 }],
}

describe('lib/validation', () => {
  describe('emailSchema', () => {
    it('accepts a well-formed email', () => {
      assert.equal(emailSchema.safeParse('user@example.com').success, true)
    })
    it('rejects a malformed email', () => {
      assert.equal(emailSchema.safeParse('not-an-email').success, false)
    })
    it('rejects an email over the length cap', () => {
      const tooLong = `${'a'.repeat(185)}@x.com`
      assert.equal(emailSchema.safeParse(tooLong).success, false)
    })
  })

  describe('passwordSchema', () => {
    it('rejects passwords shorter than 8 characters', () => {
      assert.equal(passwordSchema.safeParse('short1').success, false)
    })
    it('accepts an 8-character password', () => {
      assert.equal(passwordSchema.safeParse('12345678').success, true)
    })
    it('rejects passwords over 72 characters', () => {
      assert.equal(passwordSchema.safeParse('a'.repeat(73)).success, false)
    })
  })

  describe('checkoutSchema', () => {
    it('accepts a minimal valid checkout payload', () => {
      const result = checkoutSchema.safeParse(validCheckout)
      assert.equal(result.success, true)
    })

    it('defaults coinsToUse to 0 when omitted', () => {
      const result = checkoutSchema.parse(validCheckout)
      assert.equal(result.coinsToUse, 0)
    })

    it('rejects an empty items array', () => {
      const result = checkoutSchema.safeParse({ ...validCheckout, items: [] })
      assert.equal(result.success, false)
    })

    it('rejects a zero or negative item quantity', () => {
      const zero = checkoutSchema.safeParse({ ...validCheckout, items: [{ productId: 'p1', quantity: 0 }] })
      const negative = checkoutSchema.safeParse({ ...validCheckout, items: [{ productId: 'p1', quantity: -1 }] })
      assert.equal(zero.success, false)
      assert.equal(negative.success, false)
    })

    it('rejects a quantity above the 99-unit cap', () => {
      const result = checkoutSchema.safeParse({ ...validCheckout, items: [{ productId: 'p1', quantity: 100 }] })
      assert.equal(result.success, false)
    })

    it('rejects more than 100 distinct line items', () => {
      const items = Array.from({ length: 101 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }))
      const result = checkoutSchema.safeParse({ ...validCheckout, items })
      assert.equal(result.success, false)
    })

    it('rejects an unknown payment method', () => {
      const result = checkoutSchema.safeParse({ ...validCheckout, paymentMethod: 'CRYPTO' })
      assert.equal(result.success, false)
    })

    it('rejects a negative coinsToUse', () => {
      const result = checkoutSchema.safeParse({ ...validCheckout, coinsToUse: -5 })
      assert.equal(result.success, false)
    })

    it('rejects a shipping address missing country', () => {
      const { country, ...incomplete } = validAddress
      const result = checkoutSchema.safeParse({ ...validCheckout, shippingAddress: incomplete })
      assert.equal(result.success, false)
    })

    // firstName/lastName/line1/city are enforced at the route level instead (see
    // app/api/checkout/route.ts), only when the cart actually contains a product that
    // requires physical shipping -- the schema itself can't know that, since it has no
    // access to the products' requiresShipping flag.
    it('allows firstName/lastName/line1/city to be omitted at the schema level', () => {
      const { firstName, lastName, line1, city, ...digitalAddress } = validAddress
      const result = checkoutSchema.safeParse({ ...validCheckout, shippingAddress: digitalAddress })
      assert.equal(result.success, true)
    })

    it('rejects a malformed email in the checkout payload', () => {
      const result = checkoutSchema.safeParse({ ...validCheckout, email: 'nope' })
      assert.equal(result.success, false)
    })
  })
})
