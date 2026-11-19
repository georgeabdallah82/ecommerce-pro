import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { FUNNEL_EVENTS, readFunnelEvent } from '@/lib/meta-capi'

// Meta: the store's own Purchase event follows the shopper's cookie choice (docs/meta-consent-events-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

describe('Purchase follows the shopper\'s cookie choice', () => {
  it('the checkout sends the choice and the order keeps it', () => {
    assert.match(read('components/cookie-consent.tsx'), /export function adConsentChoice\(\): Choice \| null \{ return readChoice\(\) \}/)
    assert.match(read('app/checkout/page.tsx'), /adConsent: adConsentChoice\(\),/)
    assert.match(read('lib/validation.ts'), /adConsent: z\.enum\(\['granted', 'denied'\]\)\.nullable\(\)\.optional\(\),/)
    assert.match(read('app/api/checkout/route.ts'), /adConsent: input\.adConsent \|\| null,/)
    assert.match(read('prisma/schema.prisma'), /adConsent\s+String\?/)
    assert.match(read('prisma/migrations/20261119000000_order_ad_consent/migration.sql'), /ALTER TABLE "Order" ADD COLUMN "adConsent" TEXT;/)
  })
  it('the server sends Purchase only when the choice was granted', () => {
    const capi = read('lib/meta-capi.ts')
    assert.match(capi, /select: \{ adConsent: true, orderNumber: true,/)
    assert.match(capi, /if \(!order \|\| order\.adConsent !== 'granted'\) return/)
  })
})

describe('page views and product views stay with the pixel', () => {
  it('the store copies only add to cart and checkout started to the server (Meta\'s gateway copies every pixel event)', () => {
    assert.deepEqual([...FUNNEL_EVENTS], ['AddToCart', 'InitiateCheckout'])
    assert.equal(readFunnelEvent({ name: 'PageView', eventId: 'pageview-abc-12345678' }), null)
    assert.equal(readFunnelEvent({ name: 'ViewContent', eventId: 'viewcontent-abc-1234', currency: 'usd', value: 12.5, items: [{ id: 'p1', quantity: 1, price: 12.5 }] }), null)
  })
})
