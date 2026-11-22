import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AR } from '@/lib/i18n-ar'
import { sendRefillReminderEmail } from '@/lib/email'
import { isBlockedDuringMaintenance } from '@/lib/maintenance-paths'
import { REFILL_LATE_DAYS, cleanRefillDays, contactKeys, isRefillDue, isValidRefillToken, refillPath, refillStopPath, refillToken } from '@/lib/refill-reminders'
import { sendRefillWhatsApp } from '@/lib/whatsapp-cloud'
import { REFILL_TEMPLATE_VALUE_COUNT, refillTemplateBody } from '@/lib/whatsapp-templates'
import { GET as stopGet, POST as stopPost } from '@/app/api/refill/stop/route'

process.env.AUTH_SECRET ||= 'test-secret-for-refill-reminders'

// "Running low?" reminders (docs/refill-reminders-2026-11.md). The morning run itself was checked against PostgreSQL.
const read = (path: string) => readFileSync(path, 'utf8')
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(Date.UTC(2026, 10, 1, 9))
let savedFetch: typeof fetch
const savedEnv = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM }
beforeEach(() => { savedFetch = global.fetch; process.env.RESEND_API_KEY = 'test-key'; process.env.EMAIL_FROM = 'orders@example.com' })
afterEach(() => {
  global.fetch = savedFetch
  if (savedEnv.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedEnv.key
  if (savedEnv.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = savedEnv.from
})

describe('when a reminder is due', () => {
  it('the product editor box: empty for none, else whole days from 7 to 365', () => {
    for (const empty of [null, undefined, '', 0, -3, 'soon']) assert.equal(cleanRefillDays(empty), null, String(empty))
    assert.equal(cleanRefillDays(30), 30)
    assert.equal(cleanRefillDays('21'), 21)
    assert.equal(cleanRefillDays(2), 7)
    assert.equal(cleanRefillDays(1000), 365)
    assert.equal(cleanRefillDays(29.6), 30)
  })
  it(`from that many days after delivery, for ${REFILL_LATE_DAYS} days; never later`, () => {
    assert.equal(isRefillDue(T0, 30, new Date(T0.getTime() + 29 * DAY)), false, 'too early')
    assert.equal(isRefillDue(T0, 30, new Date(T0.getTime() + 30 * DAY)), true)
    assert.equal(isRefillDue(T0, 30, new Date(T0.getTime() + (30 + REFILL_LATE_DAYS) * DAY - 1)), true)
    assert.equal(isRefillDue(T0, 30, new Date(T0.getTime() + (30 + REFILL_LATE_DAYS) * DAY)), false, 'too late: switched on long after')
  })
  it('the customer is known by email address and mobile number', () => {
    assert.deepEqual(contactKeys({ email: ' Sara@Example.com ', phone: '70 123 456' }, 'Lebanon'), ['email:sara@example.com', 'phone:96170123456'])
    assert.deepEqual(contactKeys({ email: '', phone: null, shippingAddressJson: JSON.stringify({ phone: '03 123 456' }) }, 'Lebanon'), ['phone:9613123456'])
    assert.deepEqual(contactKeys({ email: 'no-at-sign', phone: '' }, 'Lebanon'), [])
  })
})

describe('the link', () => {
  it('is signed for its order only; it shows the products and can stop the reminders, nothing else', () => {
    const token = refillToken('1004')
    assert.equal(isValidRefillToken('1004', token), true)
    assert.equal(isValidRefillToken('1005', token), false)
    assert.equal(isValidRefillToken('1004', token.slice(1)), false)
    assert.equal(isValidRefillToken('1004', undefined), false)
    assert.equal(refillPath('1004'), `/refill/1004?t=${token}`)
    assert.equal(refillStopPath('1004'), `/api/refill/stop?o=1004&t=${token}`)
  })
  it('"Stop these reminders" needs the signature; a plain visit asks first', async () => {
    const bad = await stopPost(new Request(`http://x/api/refill/stop?o=1004&t=wrong`, { method: 'POST' }))
    assert.equal(bad.status, 400)
    const form = await stopPost(new Request(`http://x/api/refill/stop?o=1004&t=wrong`, { method: 'POST', headers: { accept: 'text/html' } }))
    assert.equal(form.status, 303)
    assert.equal(form.headers.get('location'), '/refill/1004?t=wrong', 'back to the page, which says the link is not valid')
    const visit = await stopGet(new Request(`http://x/api/refill/stop?o=1004&t=${refillToken('1004')}`))
    assert.equal(visit.headers.get('location'), `/refill/1004?t=${refillToken('1004')}&stop=1`)
    assert.equal(isBlockedDuringMaintenance('/api/refill/stop', 'POST'), false, 'works while the store is closed')
  })
})

describe('the reminder', () => {
  it('by email, in the customer\'s language, with the mail app\'s own unsubscribe, never queued for retries', async () => {
    const sent: any[] = []
    global.fetch = (async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ id: 'e1' }), { status: 200 }) }) as typeof fetch
    const reminder = { firstName: 'Sara', products: [{ name: 'Persil Gel', image: 'https://cdn.example/persil.jpg' }], url: 'https://shop.example/refill/1004?t=x', stopUrl: 'https://shop.example/refill/1004?t=x&stop=1', oneClickStopUrl: 'https://shop.example/api/refill/stop?o=1004&t=x' }
    await sendRefillReminderEmail('sara@example.com', { ...reminder, lang: 'en' })
    await sendRefillReminderEmail('sara@example.com', { ...reminder, lang: 'ar' })
    assert.equal(sent[0].subject, 'Running low on Persil Gel?')
    assert.equal(sent[0].headers['List-Unsubscribe'], '<https://shop.example/api/refill/stop?o=1004&t=x>')
    assert.equal(sent[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
    assert.ok(sent[0].html.includes('Running low, Sara?'))
    assert.equal(sent[1].subject, AR['Running low on {name}?'].replace('{name}', 'Persil Gel'))
    assert.match(sent[1].html, /dir="rtl"/)
    assert.ok(sent[1].html.includes(AR['Stop these reminders']))
    assert.match(read('lib/email.ts'), /'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' \}, retry: false \}\)/)
  })
  it('on WhatsApp: first name, what they bought, the link; the Arabic version for Arabic shoppers', async () => {
    const calls: any[] = []
    global.fetch = (async (_url: string, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }) }) as typeof fetch
    const config = { phoneNumberId: '1065', token: 'key', language: 'en', arabicVersion: true, templates: { refill: 'running_low' } }
    const result = await sendRefillWhatsApp(config, { to: '96170123456', lang: 'ar', firstName: '', products: ['Persil Gel', 'Fairy'], url: 'https://shop.example/refill/1004?t=x' })
    assert.equal(result.ok, true)
    assert.equal(calls[0].template.name, 'running_low')
    assert.equal(calls[0].template.language.code, 'ar')
    assert.deepEqual(calls[0].template.components[0].parameters.map((p: any) => p.text), ['عزيزي العميل', 'Persil Gel, Fairy', 'https://shop.example/refill/1004?t=x'])
    for (const language of ['en', 'ar']) {
      const body = refillTemplateBody(language)
      assert.equal(new Set(body.match(/\{\{\d\}\}/g)).size, REFILL_TEMPLATE_VALUE_COUNT, language)
      assert.doesNotMatch(body, /^\{\{|\}\}$/, 'WhatsApp refuses a template that starts or ends with a value')
    }
  })
})

describe('where it is set up and sent', () => {
  it('the product editor and both product saves keep the days', () => {
    assert.match(read('components/product-editor-v2.tsx'), /<Field label="“Running low\?” reminder after \(days\)"><NumInput className=\{ui\.input\} value=\{product\.refillDays \?\? null\} empty=\{null\} onValue=\{v => update\(\{ refillDays: v \}\)\}/)
    assert.match(read('app/api/admin/products/route.ts'), /refillDays: cleanRefillDays\(b\.refillDays\),/)
    assert.match(read('app/api/admin/products/[id]/route.ts'), /if\(b\.refillDays!==undefined\)data\.refillDays=cleanRefillDays\(b\.refillDays\)/)
  })
  it('the morning job sends them; Settings turns them off and holds the WhatsApp template', () => {
    assert.match(read('app/api/internal/daily/route.ts'), /const refillReminders = await sendDueRefillReminders\(now, site\)\.catch\(/)
    const card = read('components/settings-center-pro.tsx')
    assert.match(card, /<Toggle label="“Running low\?” reminders" keyName="email\.refillReminder"/)
    assert.match(card, /set\('whatsapp\.cloud\.templateRefill', waTemplateInput\(v\)\)/)
    const page = read('app/admin/settings/page.tsx')
    assert.match(page, /'email\.refillReminder',/)
    assert.match(page, /'whatsapp\.cloud\.templateRefill',/)
  })
  it('the limits: once per product per order, a week apart per customer, never after "stop", a re-order or an unsubscribe', () => {
    const src = read('lib/refill-reminders.ts')
    assert.match(read('prisma/schema.prisma'), /@@unique\(\[orderId, productId\]\)/)
    assert.match(src, /createdAt: \{ gte: new Date\(now\.getTime\(\) - REFILL_GAP_DAYS \* DAY\) \}/)
    assert.match(src, /if \(await refillStopped\(keys\)\)/)
    assert.match(src, /const again = await boughtAgain\(order, due\)/)
    assert.match(src, /!\(await isOptedOut\(order\.email\)\)/)
    assert.match(src, /if \(result\.sent >= REFILL_REMINDERS_PER_DAY\)/)
    // Counted from the first time the order was delivered; its notes never say "Delivered" (they would move that day,
    // and make review requests think the order just arrived). Found when a run's own note pushed the day forward.
    assert.match(src, /events: \{ where: \{ status: OrderStatus\.DELIVERED \}, orderBy: \{ createdAt: 'asc' \}, take: 1/)
    assert.equal((src.match(/status: REFILL_NOTE_STATUS/g) || []).length, 2)
    assert.doesNotMatch(src, /orderEvent\.create\(\{ data: \{ orderId: order\.id, status: OrderStatus\.DELIVERED/)
    // Claimed before it goes out, released when it could not.
    assert.match(src, /const claimed = await claim\(/)
    assert.match(src, /await db\.refillReminder\.deleteMany\(\{ where: \{ orderId: order\.id, productId: \{ in: claimed \} \} \}\)/)
  })
})
