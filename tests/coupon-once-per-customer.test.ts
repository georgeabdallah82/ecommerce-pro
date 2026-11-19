import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { usedCodeBefore } from '@/lib/customer-history'

// "Once per customer" discount codes (docs/coupon-once-per-customer-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

describe('once per customer', () => {
  it('is a stored setting, off for every existing discount', () => {
    assert.match(read('prisma/schema.prisma'), /oncePerCustomer    Boolean       @default\(false\)/)
    assert.match(read('prisma/migrations/20261119120000_coupon_once_per_customer/migration.sql'), /ALTER TABLE "Coupon" ADD COLUMN "oncePerCustomer" BOOLEAN NOT NULL DEFAULT false;/)
  })

  it('looks for the code, in any letter case, on orders that were not cancelled, by account, email or phone', async () => {
    // The in-memory test database does not apply these filters, so the behaviour is checked against Postgres
    // (docs/coupon-once-per-customer-2026-11.md); here, the query's shape.
    const history = read('lib/customer-history.ts')
    assert.match(history, /const used = \{ couponCode: \{ equals: code, mode: 'insensitive' as const \}, status: \{ not: 'CANCELLED' as const \} \}/)
    assert.match(history, /where: \{ \.\.\.used, userId: customer\.userId \}/)
    assert.match(history, /where: \{ \.\.\.used, email: \{ equals: e, mode: 'insensitive' \} \}/)
    assert.match(history, /WHERE "status"::text <> 'CANCELLED' AND lower\("couponCode"\) = lower\(\$\{code\}\) AND regexp_replace/)
    // Nobody to match: never "used".
    assert.equal(await usedCodeBefore('WELCOME10', {}, 'Lebanon'), false)
  })

  it('checkout and the price summary refuse a typed code the customer already used', () => {
    const checkout = read('app/api/checkout/route.ts')
    assert.match(checkout, /if \(coupon\?\.oncePerCustomer && input\.couponCode && await usedCodeBefore\(coupon\.code, \{ userId: user\?\.id, phone: input\.phone \|\| input\.shippingAddress\.phone, email: orderEmail \}/)
    assert.match(checkout, /'You have already used this code',/)
    const quote = read('app/api/checkout/quote/route.ts')
    assert.match(quote, /if \(applied\.coupon\?\.oncePerCustomer && input\.couponCode && await usedCodeBefore\(applied\.coupon\.code, \{ userId: user\?\.id, phone: input\.phone, email: input\.email \}/)
    assert.match(quote, /'You have already used this code',/)
  })

  it('is set on codes in Admin › Discounts, never on automatic discounts', () => {
    assert.match(read('app/api/admin/coupons/route.ts'), /oncePerCustomer: !b\.isAutomatic && Boolean\(b\.oncePerCustomer\),/)
    const form = read('components/coupons-admin-pro.tsx')
    assert.match(form, /\{!form\.isAutomatic && <label className=\{styles\.toggleRow\}><input type="checkbox" checked=\{form\.oncePerCustomer\}[^\n]*<strong>Once per customer<\/strong>/)
    assert.match(form, /oncePerCustomer: !form\.isAutomatic && form\.oncePerCustomer,/)
    assert.match(form, /oncePerCustomer: !!c\.oncePerCustomer,/)
  })
})
