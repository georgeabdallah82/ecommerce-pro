import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { adContextFromRequest, buildMetaPurchaseEvent } from '@/lib/meta-capi'

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
