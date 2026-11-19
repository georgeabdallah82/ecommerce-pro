import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { buildMetaFunnelEvent, readFunnelEvent } from '@/lib/meta-capi'

// The Meta pixel and Conversions API: consent and matching event ids (docs/meta-consent-events-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

describe('Purchase follows the shopper\'s cookie choice', () => {
  it('the checkout sends the choice and the order keeps it', () => {
    assert.match(read('app/checkout/page.tsx'), /adConsent: adConsentChoice\(\),/)
    assert.match(read('lib/validation.ts'), /adConsent: z\.enum\(\['granted', 'denied'\]\)\.nullable\(\)\.optional\(\),/)
    assert.match(read('app/api/checkout/route.ts'), /adConsent: input\.adConsent \|\| null,/)
    assert.match(read('prisma/schema.prisma'), /adConsent\s+String\?/)
    assert.match(read('prisma/migrations/20261119000000_order_ad_consent/migration.sql'), /ALTER TABLE "Order" ADD COLUMN "adConsent" TEXT;/)
  })
  it('the server sends Purchase only when the choice was granted', () => {
    assert.match(read('lib/meta-capi.ts'), /if \(!order \|\| order\.adConsent !== 'granted'\) return/)
  })
})

describe('page views and product views reach Meta once, from the browser and the server', () => {
  it('reads a page view (no products) and a product view', () => {
    assert.deepEqual(readFunnelEvent({ name: 'PageView', eventId: 'pageview-abc-12345678', url: 'https://shop.example/x' }), { name: 'PageView', eventId: 'pageview-abc-12345678', currency: '', value: 0, url: 'https://shop.example/x', items: [] })
    const view = readFunnelEvent({ name: 'ViewContent', eventId: 'viewcontent-abc-1234', currency: 'usd', value: 12.5, items: [{ id: 'p1', quantity: 1, price: 12.5 }] })
    assert.equal(view?.name, 'ViewContent'); assert.equal(view?.currency, 'USD')
    assert.equal(readFunnelEvent({ name: 'Lead', eventId: 'lead-abc-12345678' }), null)
  })
  it('a page view goes to Meta with its id and no product data', () => {
    const event = buildMetaFunnelEvent({ name: 'PageView', eventId: 'pageview-abc-12345678', currency: '', value: 0, items: [] }, { storeUrl: 'https://shop.example' })
    assert.equal(event.event_id, 'pageview-abc-12345678'); assert.equal(event.custom_data, undefined)
  })
  it('the browser fires them with the same id it sends to the server; Meta\'s own address counting is off', () => {
    const scripts = read('components/tracking-scripts.tsx')
    assert.match(scripts, /fbq\.disablePushState=true;\nfbq\('init'/)
    assert.match(scripts, /fbq\('track','PageView',\{\},\{eventID:pv\}\);/)
    assert.match(scripts, /JSON\.stringify\(\{name:'PageView',eventId:pv,url:location\.href\}\)/)
    assert.match(scripts, /trackPageView\(\)/)
    const events = read('lib/tracking-events.ts')
    assert.match(events, /window\.fbq\?\.\('track', 'ViewContent', \{[^\n]*\}, \{ eventID \}\)\)\n  reportToServer\('ViewContent', eventID,/)
    assert.match(events, /safely\(\(\) => window\.fbq\?\.\('track', 'PageView', \{\}, \{ eventID \}\)\)\n  reportToServer\('PageView', eventID, \[\], 0, ''\)/)
  })
})
