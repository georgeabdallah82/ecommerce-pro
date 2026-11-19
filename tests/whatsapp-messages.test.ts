import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { deliverWhatsApp, templateLanguage, templateName, templateParams, whatsappFailureIsPermanent, whatsappUpdateForStatus } from '@/lib/whatsapp-cloud'
import { TEMPLATE_VALUE_COUNT, WHATSAPP_UPDATES, templateBody } from '@/lib/whatsapp-templates'
import { checkoutSchema } from '@/lib/validation'

process.env.AUTH_SECRET ||= 'test-secret-for-whatsapp-messages'

// Automatic WhatsApp messages (docs/whatsapp-messages-2026-11.md). What each message sends is checked here; the
// sending, the once-per-order rule and the retries were also run against Postgres and a stand-in WhatsApp server.
const read = (path: string) => readFileSync(path, 'utf8')
const SITE = 'https://shop.example'
const order = (over: Record<string, unknown> = {}) => ({
  orderNumber: 'N1001', paymentStatus: 'UNPAID', paymentMethod: 'COD', phone: '70 123 456', grandTotal: 2500, currency: 'USD',
  shippingAddressJson: JSON.stringify({ firstName: 'Sara Haddad', phone: '70 123 456' }), ...over,
})

describe('which message goes with which status', () => {
  it('confirmed (also when preparing), out for delivery, delivered; nothing else', () => {
    assert.deepEqual(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].map(whatsappUpdateForStatus), [null, 'confirmed', 'confirmed', 'on_the_way', 'delivered', null, null])
  })
})

describe('what each message says', () => {
  it('confirmed: first name, order number, total with how it is paid, the link to follow the order', () => {
    const [name, number, total, link] = templateParams('confirmed', order(), SITE)
    assert.equal(name, 'Sara')
    assert.equal(number, 'N1001')
    assert.equal(total, '$25.00 (cash on delivery)')
    assert.match(link, /^https:\/\/shop\.example\/account\/orders\/N1001\?t=[\w-]+$/)
    assert.equal(templateParams('confirmed', order({ paymentMethod: 'CARD', paymentStatus: 'PAID' }), SITE)[2], '$25.00 (paid)')
  })
  it('out for delivery: what to have ready, or that nothing is due', () => {
    assert.equal(templateParams('on_the_way', order(), SITE)[2], '$25.00 in cash')
    assert.equal(templateParams('on_the_way', order({ paymentMethod: 'CARD', paymentStatus: 'PAID' }), SITE)[2], 'nothing, it is already paid')
  })
  it('delivered: the "rate your order" link', () => {
    const values = templateParams('delivered', order(), SITE)
    assert.equal(values.length, 3)
    assert.match(values[2], /^https:\/\/shop\.example\/review\/N1001\?t=[\w-]+$/)
  })
  it('in Arabic when the templates are Arabic', () => {
    assert.equal(templateParams('confirmed', order(), SITE, 'ar')[2], '$25.00 (الدفع عند الاستلام)')
    assert.equal(templateParams('on_the_way', order({ paymentStatus: 'PAID', paymentMethod: 'CARD' }), SITE, 'ar')[2], 'لا شيء، الطلب مدفوع')
    assert.equal(templateParams('confirmed', order({ shippingAddressJson: '{}' }), SITE, 'ar')[0], 'عزيزي العميل')
  })
  it('a customer with no name is greeted as "there"; a value is always one line (WhatsApp refuses new lines and tabs)', () => {
    assert.equal(templateParams('confirmed', order({ shippingAddressJson: '{}' }), SITE)[0], 'there')
    const values = templateParams('confirmed', order({ orderNumber: 'N\t10\n01', shippingAddressJson: JSON.stringify({ firstName: '  Line\none  ' }) }), SITE)
    for (const value of values) assert.doesNotMatch(value, /[\n\t]| {5}/, value)
  })
  it('each message fills exactly the values its template has, and no template starts or ends with a value', () => {
    for (const language of ['en', 'ar']) {
      for (const kind of WHATSAPP_UPDATES) {
        const body = templateBody(kind, language)
        const slots = new Set(body.match(/\{\{\d+\}\}/g))
        assert.equal(slots.size, TEMPLATE_VALUE_COUNT[kind], `${language} ${kind}`)
        assert.equal(templateParams(kind, order(), SITE, language).length, TEMPLATE_VALUE_COUNT[kind], `${language} ${kind}`)
        assert.doesNotMatch(body.trim(), /^\{\{|\}\}$/, `${language} ${kind}`)
      }
    }
  })
})

describe('settings', () => {
  it('template names as WhatsApp Manager makes them; an unknown language falls back to English', () => {
    assert.equal(templateName(' Order Confirmed '), 'order_confirmed')
    assert.equal(templateName('order-confirmed'), '')
    assert.equal(templateName(''), '')
    assert.deepEqual(['en', 'en_US', 'ar', 'EN', 'english', ''].map(templateLanguage), ['en', 'en_US', 'ar', 'en', 'en', 'en'])
  })
  it('the access key is a write-only secret, sealed when saved (both saves), never saved over by the mask', () => {
    const route = read('app/api/admin/settings/route.ts')
    assert.match(route, /const SECRET_KEYS = new Set\(\['tracking\.metaCapiToken', 'whatsapp\.cloud\.accessToken'\]\)/)
    assert.match(route, /changed\.map\(async\(\[key,typed\]\)=>\{const value=await storedValue\(key,typed\)/)
    assert.match(route, /const value=await storedValue\(key,String\(b\.value\?\?''\)\)/)
    assert.match(route, /filter\(\(\[k,v\]\)=>k&&!isMaskEcho\(k,v\)\)/)
    assert.match(read('lib/secret-settings.ts'), /const SEALED_KEYS = \['tracking\.metaCapiToken', 'whatsapp\.cloud\.accessToken'\]/)
    assert.doesNotMatch(read('app/admin/settings/page.tsx'), /'whatsapp\.cloud\.accessToken',/)
  })
  it('"Send a test" is for staff who manage settings, and limited', () => {
    const route = read('app/api/admin/whatsapp/test/route.ts')
    assert.match(route, /requirePermission\('settings\.manage'\)/)
    assert.match(route, /consumeDurableRateLimit\(`whatsapp-test:\$\{actor\.id\}`, 10, /)
  })
})

describe('sending', () => {
  it('a failure that may pass is tried again; a refusal is not', () => {
    for (const [status, code] of [[0, 0], [408, 0], [429, 0], [500, 0], [503, 0], [400, 130429], [400, 131056], [500, 131000], [503, 131016], [400, 4], [400, 80007]]) assert.equal(whatsappFailureIsPermanent(status, code), false, `${status}/${code}`)
    for (const [status, code] of [[400, 0], [401, 190], [400, 131030], [404, 132001], [400, 132000], [400, 100], [403, 10]]) assert.equal(whatsappFailureIsPermanent(status, code), true, `${status}/${code}`)
  })
  it('sends the template to the number, with the key in the header, and reads the message id', async () => {
    const saved = { fetch: global.fetch, base: process.env.WHATSAPP_API_URL }
    process.env.WHATSAPP_API_URL = 'http://wa.stand-in'
    const calls: Array<{ url: string; init: RequestInit }> = []
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.ABC' }] }), { status: 200 })
    }) as typeof fetch
    try {
      const result = await deliverWhatsApp({ phoneNumberId: '1065403', token: 'test-key' }, { to: '96170123456', template: 'order_confirmed', language: 'en', params: ['Sara', 'N1001'] })
      assert.deepEqual(result, { ok: true, messageId: 'wamid.ABC' })
      assert.equal(calls[0].url, 'http://wa.stand-in/v23.0/1065403/messages')
      assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer test-key')
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: '96170123456', type: 'template',
        template: { name: 'order_confirmed', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Sara' }, { type: 'text', text: 'N1001' }] }] },
      })
    } finally {
      global.fetch = saved.fetch
      if (saved.base === undefined) delete process.env.WHATSAPP_API_URL; else process.env.WHATSAPP_API_URL = saved.base
    }
  })
  it('reports a refusal in plain words, and a busy or unreachable WhatsApp as one to try again', async () => {
    const saved = global.fetch
    const answers = [
      new Response(JSON.stringify({ error: { message: '(#131030) Recipient phone number not in allowed list', code: 131030 } }), { status: 400 }),
      new Response(JSON.stringify({ error: { message: 'Rate limit hit', code: 130429 } }), { status: 400 }),
      new Response('<html>Bad gateway</html>', { status: 502 }),
      new Response(JSON.stringify({ error: { message: 'Authentication Error', code: 0 } }), { status: 401 }),
    ]
    global.fetch = (async () => { const next = answers.shift(); if (!next) throw new TypeError('fetch failed'); return next }) as typeof fetch
    try {
      const config = { phoneNumberId: '1', token: 'k' }
      const message = { to: '96170123456', template: 'order_confirmed', language: 'en', params: [] }
      const refused = await deliverWhatsApp(config, message)
      assert.equal(refused.permanent, true)
      assert.match(String(refused.error), /not on the test list.*\(WhatsApp code 131030\)/)
      const busy = await deliverWhatsApp(config, message)
      assert.equal(busy.permanent, false)
      const badGateway = await deliverWhatsApp(config, message)
      assert.deepEqual([badGateway.permanent, badGateway.error], [false, 'WhatsApp said: HTTP 502'])
      const wrongKey = await deliverWhatsApp(config, message)
      assert.deepEqual([wrongKey.permanent, wrongKey.error], [true, 'the access key was refused; save a new one in Settings (WhatsApp code 0)'])
      const unreachable = await deliverWhatsApp(config, message)
      assert.equal(unreachable.permanent, false)
      assert.match(String(unreachable.error), /Could not reach WhatsApp/)
    } finally {
      global.fetch = saved
    }
  })
})

describe('where the messages start', () => {
  it('only when the customer asked, at checkout, where the store offers it; never ticked for them', () => {
    assert.equal(checkoutSchema.shape.whatsappUpdates.safeParse(true).success, true)
    assert.match(read('app/api/checkout/route.ts'), /whatsappUpdates: input\.whatsappUpdates === true,/)
    const page = read('app/checkout/page.tsx')
    assert.match(page, /const \[whatsappUpdates, setWhatsappUpdates\] = useState\(false\)/)
    assert.match(page, /\{settings\?\.checkout\.whatsappUpdates && <label className=\{s\.check\}><input type="checkbox" name="whatsappUpdates"/)
    assert.match(page, /whatsappUpdates: settings\?\.checkout\.whatsappUpdates \? whatsappUpdates : false,/)
    assert.match(read('app/api/store/settings/route.ts'), /checkout:\{guestCheckout:[^}]*,whatsappUpdates,/)
  })
  it('from the three places an order changes status: the order page, a shipment delivered, the driver', () => {
    assert.match(read('app/api/admin/orders/route.ts'), /if \(result\.statusChanged && whatsappUpdateForStatus\(result\.updated\.status\)\) \{\n\s+const origin = await requestOrigin\(\)\n\s+runInBackground\(sendOrderWhatsApp\(result\.updated\.id, result\.updated\.status, origin\)/)
    assert.match(read('app/api/admin/fulfillments/[id]/route.ts'), /runInBackground\(sendOrderWhatsApp\(orderEvent\.orderId, OrderStatus\.DELIVERED, await requestOrigin\(\)\)/)
    assert.match(read('lib/drivers.ts'), /runInBackground\(sendOrderWhatsApp\(order\.id, OrderStatus\.DELIVERED, origin\)/)
    assert.match(read('app/api/driver/[token]/route.ts'), /markDeliveredByDriver\(driver, orderId, await requestOrigin\(\)\)/)
  })
  it('once per message per order; a failure that may pass goes to the hourly retries, which note the last try on the order', () => {
    const sender = read('lib/whatsapp-cloud.ts')
    assert.match(sender, /const earlier = await db\.orderEvent\.findFirst\(\{ where: \{ orderId: order\.id, message: \{ startsWith: marker\(kind\) \} \}/)
    assert.match(sender, /if \(!result\.permanent\) \{\n\s+await queueRetry\('whatsapp', message,/)
    const outbox = read('lib/outbox.ts')
    assert.match(outbox, /export type OutboxKind = 'email' \| 'webhook' \| 'whatsapp'/)
    assert.match(outbox, /if \(kind === 'whatsapp'\) return \(await import\('@\/lib\/whatsapp-cloud'\)\)\.retryQueuedWhatsApp\(payload, lastTry\)/)
    assert.match(outbox, /attempt\(message\.kind, JSON\.parse\(message\.payloadJson\), attempts >= OUTBOX_MAX_ATTEMPTS\)/)
  })
})
