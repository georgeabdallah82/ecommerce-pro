import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AR } from '@/lib/i18n-ar'
import { db } from '@/lib/prisma'
import { sendAbandonedCheckoutEmail, sendAlreadyRegisteredEmail, sendBackInStockEmail, sendEmailVerificationEmail, sendPasswordResetEmail } from '@/lib/email'
import { defaultLangOf, langFor, messageLang } from '@/lib/message-lang'
import { deliverWithFallback, templateParams, whatsappLanguageFor } from '@/lib/whatsapp-cloud'

process.env.AUTH_SECRET ||= 'test-secret-for-arabic-messages'

// Customers get their emails and WhatsApp messages in the language they shop in (docs/arabic-messages-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM', 'NEXT_PUBLIC_SITE_URL'] as const
let savedEnv: Record<string, string | undefined>
let savedFetch: typeof fetch
let sent: Array<{ url: string; body: any }>

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  savedFetch = global.fetch
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'orders@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example'
  sent = []
  global.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body || '{}')) })
    return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })
  }) as typeof fetch
})
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  global.fetch = savedFetch
})

describe('which language a message goes in', () => {
  it('only "en" and "ar" are kept; anything else is unknown', () => {
    assert.equal(messageLang('ar'), 'ar')
    assert.equal(messageLang('en'), 'en')
    for (const value of ['AR', 'fr', '', null, undefined, 1]) assert.equal(messageLang(value), null)
  })
  it('without one, the store default: Arabic only when the Arabic store is on and is the default', () => {
    assert.equal(defaultLangOf({ arabic: true, defaultLang: 'ar' }), 'ar')
    assert.equal(defaultLangOf({ arabic: true, defaultLang: 'en' }), 'en')
    assert.equal(defaultLangOf({ arabic: false, defaultLang: 'ar' }), 'en', 'Arabic switched off: English')
    assert.equal(defaultLangOf(null), 'en')
  })
  it('a record keeps its own language', async () => {
    assert.equal(await langFor({ lang: 'ar', email: 'a@example.com' }), 'ar')
    assert.equal(await langFor({ lang: 'en' }), 'en')
    assert.equal(await langFor({ lang: null }), 'en', 'no order and no Arabic default: English')
  })
})

describe('emails in Arabic', () => {
  it('read right to left, in Arabic, subject included; English stays as before', async () => {
    await sendPasswordResetEmail('a@example.com', 'https://shop.example/account/reset-password?token=t', 30, 'ar')
    const ar = sent[0].body
    assert.equal(ar.subject, AR['Reset your password'])
    assert.match(ar.html, /<html lang="ar" dir="rtl">/)
    assert.match(ar.html, /<table role="presentation" width="560" dir="rtl"/)
    assert.ok(ar.html.includes(AR['Reset password']), 'the button')
    assert.ok(ar.text.includes('30'), 'the minutes are filled in')
    await sendPasswordResetEmail('a@example.com', 'https://shop.example/account/reset-password?token=t', 30)
    const en = sent[1].body
    assert.equal(en.subject, 'Reset your password')
    assert.match(en.html, /<html lang="en" dir="ltr">/)
    assert.ok(en.html.includes('This link expires in 30 minutes.'))
  })
  it('sign-up and "back in stock" emails too', async () => {
    await sendEmailVerificationEmail('a@example.com', 'https://shop.example/api/auth/verify-email?token=t', 48, 'ar')
    await sendAlreadyRegisteredEmail('a@example.com', 'https://shop.example/account/login', 'https://shop.example/account/forgot-password', 'ar')
    await sendBackInStockEmail('a@example.com', { name: 'Persil Gel', slug: 'persil-gel' }, 'ar')
    assert.deepEqual(sent.map(s => s.body.subject), [AR['Confirm your email'], AR['You already have an account'], AR['Back in stock: {name}'].replace('{name}', 'Persil Gel')])
    for (const s of sent) assert.match(s.body.html, /dir="rtl"/)
    assert.ok(sent[0].body.html.includes(AR['Thanks for creating an account. Confirm this address to finish; the link expires in {hours} hours.'].replace('{hours}', '48')))
  })
  it('a cart left in Arabic is reminded in Arabic, with the amounts on the left', async () => {
    const cart = await db.abandonedCheckout.upsert({
      where: { token: 'arabic-cart' },
      update: {},
      create: { token: 'arabic-cart', email: 'sara@example.com', lang: 'ar', cartJson: JSON.stringify([{ name: 'Persil Gel', quantity: 2, unitPrice: 1250 }]), subtotal: 2500, currency: 'USD' },
    })
    const result = await sendAbandonedCheckoutEmail(cart.id, { automatic: true, unsubscribeUrl: 'https://shop.example/unsubscribe/x' })
    assert.equal(result.sent, true)
    const email = sent[0].body
    assert.equal(email.subject, AR['You left something in your cart'])
    assert.match(email.html, /text-align:left;color:#121212">USD 25\.00</)
    assert.ok(email.html.includes(AR['Stop these emails']))
    assert.ok(email.text.includes(AR['Stop cart reminder emails: {url}'].replace('{url}', 'https://shop.example/unsubscribe/x')))
  })
  it('every customer email takes the customer\'s language; staff emails stay English', () => {
    const src = read('lib/email.ts')
    const customer = ['sendPasswordResetEmail', 'sendOrderConfirmationEmail', 'sendFulfillmentEmail', 'sendDraftOrderInvoiceEmail', 'sendGiftCardIssuedEmail', 'sendReturnStatusEmail', 'sendOrderEditEmail', 'issueAndNotifyGiftCardsForOrder', 'sendBackInStockEmail', 'sendAbandonedCheckoutEmail', 'sendReviewRequestEmail', 'sendEmailVerificationEmail', 'sendAlreadyRegisteredEmail']
    const staff = ['sendDailySummaryEmail', 'sendSecurityAlertEmail', 'sendOrderProblemEmail', 'sendWeeklyReportEmail']
    const body = (name: string) => { const start = src.indexOf(`export async function ${name}(`); assert.ok(start >= 0, name); return src.slice(start, src.indexOf('\n}\n', start)) }
    for (const name of customer) {
      assert.match(body(name), /`, brand, lang\)/, `${name} is laid out in the customer's language`)
      assert.match(body(name), /const t = translator\(lang\)/, `${name} translates its texts`)
    }
    for (const name of staff) assert.doesNotMatch(body(name), /brand, lang\)/, `${name} stays English`)
    // An order's emails read the order's own language (or the customer's earlier one).
    for (const name of ['sendOrderConfirmationEmail', 'sendFulfillmentEmail', 'sendReturnStatusEmail', 'sendOrderEditEmail', 'issueAndNotifyGiftCardsForOrder']) assert.match(body(name), /const lang = await langFor\(order\)/, name)
  })
})

describe('the language is kept where the shopper acts', () => {
  it('the order at checkout, the cart left at checkout, the "notify me" request', () => {
    assert.match(read('app/api/checkout/route.ts'), /const lang = await shopperLang\(\)[\s\S]+whatsappUpdates: input\.whatsappUpdates === true,\n\s+lang,/)
    const progress = read('app/api/checkout/progress/route.ts')
    assert.match(progress, /const lang = await shopperLang\(\)/)
    assert.equal((progress.match(/recoveryUrl, lang/g) || []).length, 2, 'saved on the first save and on every later one')
    assert.match(read('app/api/back-in-stock/route.ts'), /requestBackInStock\(body, user\?\.role === 'CUSTOMER' \? user\.id : null, await shopperLang\(\)\)/)
    assert.match(read('lib/back-in-stock.ts'), /const data = \{ productId: product\.id, variantId, userId, lang, \.\.\.target \}/)
  })
  it('account emails go in the language of the page they were asked from', () => {
    assert.match(read('app/api/auth/forgot-password/route.ts'), /sendPasswordResetEmail\(user\.email, resetUrl, 30, lang\)/)
    const register = read('app/account/register/server.ts')
    assert.match(register, /forgot-password`, lang\)/)
    assert.match(register, /VERIFY_HOURS, lang\)/)
    assert.match(read('app/api/auth/resend-verification/route.ts'), /VERIFY_HOURS, lang\)/)
    assert.match(read('app/api/internal/daily/route.ts'), /products, lang: order\.lang, userId: order\.userId \}/)
  })
  it('the columns exist (migration and schema)', () => {
    const sql = read('prisma/migrations/20261122000000_message_language/migration.sql')
    for (const table of ['Order', 'AbandonedCheckout', 'BackInStockRequest']) assert.match(sql, new RegExp(`ALTER TABLE "${table}" ADD COLUMN "lang" TEXT;`))
  })
})

describe('WhatsApp in Arabic', () => {
  const config = { phoneNumberId: '1065', token: 'key', language: 'en', arabicVersion: true }
  it('the Arabic version for a customer who shops in Arabic, once the owner says the templates have one', () => {
    assert.equal(whatsappLanguageFor(config, 'ar'), 'ar')
    assert.equal(whatsappLanguageFor(config, 'en'), 'en')
    assert.equal(whatsappLanguageFor({ ...config, arabicVersion: false }, 'ar'), 'en')
    assert.equal(whatsappLanguageFor({ ...config, language: 'en_US' }, 'ar'), 'ar')
    assert.equal(whatsappLanguageFor({ language: 'ar', arabicVersion: false }, 'en'), 'ar', 'templates made in Arabic stay Arabic')
  })
  it('a template with no Arabic version yet: the message goes in the main language instead', async () => {
    const calls: any[] = []
    global.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      calls.push(body)
      if (body.template.language.code === 'ar') return new Response(JSON.stringify({ error: { code: 132001, message: 'Template name does not exist in the translation' } }), { status: 404 })
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })
    }) as typeof fetch
    const order = { orderNumber: 'N1001', paymentStatus: 'UNPAID', paymentMethod: 'COD', phone: '70123456', grandTotal: 2500, currency: 'USD', shippingAddressJson: '{}' }
    const message = { to: '96170123456', template: 'order_confirmed', language: 'ar', params: templateParams('confirmed', order, 'https://shop.example', 'ar'), fallback: { language: 'en', params: templateParams('confirmed', order, 'https://shop.example', 'en') } }
    const result = await deliverWithFallback(config, message)
    assert.equal(result.ok, true)
    assert.equal(result.fellBackTo, 'en')
    assert.deepEqual(calls.map(c => c.template.language.code), ['ar', 'en'])
    assert.equal(calls[0].template.components[0].parameters[0].text, 'عزيزي العميل', 'Arabic words in the Arabic version')
    assert.equal(calls[1].template.components[0].parameters[0].text, 'there', 'English words in the English one')
  })
  it('any other refusal is not sent again in English', async () => {
    let calls = 0
    global.fetch = (async () => { calls++; return new Response(JSON.stringify({ error: { code: 131026, message: 'Receiver is incapable' } }), { status: 400 }) }) as typeof fetch
    const result = await deliverWithFallback(config, { to: '96170123456', template: 'order_confirmed', language: 'ar', params: ['a', 'b', 'c', 'd'], fallback: { language: 'en', params: ['a', 'b', 'c', 'd'] } })
    assert.equal(result.ok, false)
    assert.equal(calls, 1)
  })
  it('orders choose their language when sent and when retried; Settings has the switch and an Arabic test', () => {
    const src = read('lib/whatsapp-cloud.ts')
    assert.match(src, /const language = whatsappLanguageFor\(config, await langFor\(order\)\)/)
    assert.equal((src.match(/await deliverWithFallback\(config, message\)/g) || []).length, 2, 'the first try and the hourly retries')
    const card = read('components/settings-center-pro.tsx')
    assert.match(card, /<Toggle label="My templates also have an Arabic version" keyName="whatsapp\.cloud\.arabicVersion"/)
    assert.match(card, /\{templateBody\(kind, 'ar'\)\}/)
    assert.match(read('app/api/admin/whatsapp/test/route.ts'), /const language = body\?\.arabic === true \? 'ar' : config\.language/)
    assert.match(read('app/admin/settings/page.tsx'), /'whatsapp\.cloud\.arabicVersion',/)
  })
})
