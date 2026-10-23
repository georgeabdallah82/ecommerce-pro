import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { adContextFromRequest, buildMetaFunnelEvent, buildMetaPurchaseEvent, readFunnelEvent } from '@/lib/meta-capi'

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

describe('Meta Conversions API purchase', () => {
  const order = {
    orderNumber: 'ORD-9', email: ' Maya@Example.com ', phone: '70 123 456', userId: null, grandTotal: 5000, currency: 'USD',
    shippingAddressJson: JSON.stringify({ firstName: 'Maya', lastName: 'Haddad', city: 'Beirut', country: 'Lebanon' }),
    items: [{ productId: 'p1', quantity: 2, unitPrice: 2250 }],
  }

  it('builds a Purchase with the browser pixel event id and hashed customer details', () => {
    const e = buildMetaPurchaseEvent(order, { storeCountry: 'Lebanon', storeUrl: 'https://shop.example', now: 1_700_000_000_000, context: { ip: '1.2.3.4', userAgent: 'UA', fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc' } })
    assert.equal(e.event_name, 'Purchase')
    assert.equal(e.event_id, 'purchase-ORD-9')
    assert.equal(e.event_time, 1_700_000_000)
    assert.equal(e.event_source_url, 'https://shop.example/order/success')
    assert.deepEqual(e.user_data, {
      em: [sha('maya@example.com')], ph: [sha('96170123456')], fn: [sha('maya')], ln: [sha('haddad')], ct: [sha('beirut')], country: [sha('lb')],
      external_id: [sha('maya@example.com')], client_ip_address: '1.2.3.4', client_user_agent: 'UA', fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc',
    })
    assert.deepEqual(e.custom_data, { currency: 'USD', value: 50, order_id: 'ORD-9', content_type: 'product', content_ids: ['p1'], contents: [{ id: 'p1', quantity: 2, item_price: 22.5 }], num_items: 2 })
  })

  it('reads the matching details from the shopper request', () => {
    const req = new Request('https://shop.example/api/checkout', { headers: { 'cf-connecting-ip': '5.6.7.8', 'user-agent': 'Phone', cookie: 'a=1; _fbp=fb.1.10.20; session=x', referer: 'https://shop.example/checkout?fbclid=CLICK' } })
    const ctx = adContextFromRequest(req)
    assert.equal(ctx.ip, '5.6.7.8'); assert.equal(ctx.userAgent, 'Phone'); assert.equal(ctx.fbp, 'fb.1.10.20')
    assert.match(ctx.fbc || '', /^fb\.1\.\d+\.CLICK$/)
    assert.equal(ctx.sourceUrl, 'https://shop.example/checkout?fbclid=CLICK')
  })
})

describe('Meta Conversions API: add to cart and checkout start', () => {
  const sid = 'a'.repeat(32)
  const good = { name: 'AddToCart', eventId: 'addtocart-abc123-xyz789', currency: 'usd', value: 45.5, url: 'https://shop.example/product/kit', items: [{ id: 'p1', quantity: 2, price: 22.75 }] }

  it('accepts a well-formed report and tidies it', () => {
    const e = readFunnelEvent(good)
    assert.ok(e)
    assert.equal(e!.currency, 'USD')
    assert.deepEqual(e!.items, [{ id: 'p1', quantity: 2, price: 22.75 }])
  })

  it('drops reports that are not what the store sends', () => {
    for (const bad of [null, 'x', {}, { ...good, name: 'Purchase' }, { ...good, eventId: 'short' }, { ...good, eventId: 'has spaces and ! marks' }, { ...good, currency: 'dollars' },
      { ...good, items: [] }, { ...good, items: [{ id: '<script>', quantity: 1, price: 1 }] }, { ...good, items: [{ id: 'p1', quantity: 0, price: 1 }] },
      { ...good, items: [{ id: 'p1', quantity: 1, price: -5 }] }, { ...good, value: -1 }, { ...good, value: 'NaN' }, { ...good, value: 99_000_000 }]) {
      assert.equal(readFunnelEvent(bad), null, JSON.stringify(bad).slice(0, 80))
    }
  })

  it('keeps at most 30 items and ignores the unusable ones', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, quantity: 1, price: 1 }))
    assert.equal(readFunnelEvent({ ...good, items: many })!.items.length, 30)
    assert.equal(readFunnelEvent({ ...good, items: [{ id: 'p1', quantity: 1, price: 1 }, { id: '', quantity: 1, price: 1 }] })!.items.length, 1)
  })

  it('builds the event with the pixel\'s event id and the visitor details Meta uses to match', () => {
    const e = buildMetaFunnelEvent(readFunnelEvent(good)!, { storeUrl: 'https://shop.example', now: 1_700_000_000_000, userId: 'user-1', context: { ip: '1.2.3.4', userAgent: 'UA', fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc', sid, sourceUrl: 'https://shop.example/cart' } })
    assert.equal(e.event_name, 'AddToCart')
    assert.equal(e.event_id, 'addtocart-abc123-xyz789')
    assert.equal(e.event_time, 1_700_000_000)
    assert.equal(e.action_source, 'website')
    assert.equal(e.event_source_url, 'https://shop.example/product/kit')
    assert.deepEqual(e.user_data, { external_id: [sha('user-1'), sha(sid)], client_ip_address: '1.2.3.4', client_user_agent: 'UA', fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc' })
    assert.deepEqual(e.custom_data, { currency: 'USD', value: 45.5, content_type: 'product', content_ids: ['p1'], contents: [{ id: 'p1', quantity: 2, item_price: 22.75 }], num_items: 2 })
  })

  it('never takes another website as the source of the event', () => {
    const e = buildMetaFunnelEvent(readFunnelEvent({ ...good, url: 'https://evil.example/x' })!, { storeUrl: 'https://shop.example', context: { sourceUrl: 'https://shop.example/cart' } })
    assert.equal(e.event_source_url, 'https://shop.example/cart')
  })

  it('has no external id when the visitor is unknown', () => {
    const e = buildMetaFunnelEvent(readFunnelEvent(good)!, { storeUrl: 'https://shop.example', context: {} })
    assert.equal('external_id' in e.user_data, false)
  })

  it('reads the visitor id from the store cookie, and adds it to a purchase', () => {
    const req = new Request('https://shop.example/api/checkout', { headers: { cookie: `yh_sid=${sid}; _fbp=fb.1.10.20` } })
    assert.equal(adContextFromRequest(req).sid, sid)
    assert.equal(adContextFromRequest(new Request('https://shop.example/', { headers: { cookie: 'yh_sid=not-a-real-id' } })).sid, undefined)
    const purchase = buildMetaPurchaseEvent({ orderNumber: 'ORD-1', email: 'a@b.co', userId: null, grandTotal: 1000, currency: 'USD', items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }] }, { context: { sid } })
    assert.deepEqual(purchase.user_data.external_id, [sha('a@b.co'), sha(sid)])
  })
})

