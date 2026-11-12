import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { webhookCallerFor } from '../lib/payments'

// The owner's decisions, recorded in docs/owner-decisions-2026-11.md: D2 (coins count toward free delivery),
// D3 (120 quote requests per 10 minutes per IP, confirmed) and D5 (the gateway's secret in a header, not the URL).

const read = (path: string) => readFileSync(path, 'utf8')

const SECRET = 'k7Qx2mP9vR4tB8nW1sL5yH3dF6gJ0cZa' // 32 characters, the shape of the gateway's notification secret
const URL_TOKEN = 'f'.repeat(64) // the shape of areebaWebhookToken(): a SHA-256 hex digest

test('the gateway secret in the X-Notification-Secret header lets a notification in', () => {
  assert.equal(webhookCallerFor({ header: SECRET, urlToken: null, secret: SECRET, expectedUrlToken: URL_TOKEN }), 'header')
})

test('the URL token from before the switch still lets notifications in, so those orders are not stranded', () => {
  assert.equal(webhookCallerFor({ header: null, urlToken: URL_TOKEN, secret: SECRET, expectedUrlToken: URL_TOKEN }), 'url-token')
  assert.equal(webhookCallerFor({ header: null, urlToken: URL_TOKEN, secret: '', expectedUrlToken: URL_TOKEN }), 'url-token')
})

test('a wrong header or token is refused, and empty values never match', () => {
  assert.equal(webhookCallerFor({ header: 'wrong', urlToken: null, secret: SECRET, expectedUrlToken: URL_TOKEN }), null)
  assert.equal(webhookCallerFor({ header: null, urlToken: 'wrong', secret: SECRET, expectedUrlToken: URL_TOKEN }), null)
  assert.equal(webhookCallerFor({ header: null, urlToken: null, secret: SECRET, expectedUrlToken: URL_TOKEN }), null)
  assert.equal(webhookCallerFor({ header: '', urlToken: '', secret: '', expectedUrlToken: URL_TOKEN }), null)
  assert.equal(webhookCallerFor({ header: '', urlToken: '', secret: '', expectedUrlToken: '' }), null)
})

test('the webhook reads the secret header, and its log lines are fixed text that never includes the token', () => {
  const webhook = read('app/api/payments/areeba/webhook/route.ts')
  assert.match(webhook, /webhookCallerFor\(\{ header: req\.headers\.get\('x-notification-secret'\), urlToken: url\.searchParams\.get\('token'\), secret: areebaWebhookSecret\(\), expectedUrlToken: areebaWebhookToken\(\) \}\)/)
  assert.match(webhook, /if \(!caller\) \{/)
  assert.doesNotMatch(webhook, /console\.\w+\(`/, 'no log line interpolates a value')
})

test('a new payment session carries no token once AREEBA_WEBHOOK_SECRET is set, and the variable is in the template', () => {
  assert.match(read('lib/payments.ts'), /const webhookUrl=areebaWebhookSecret\(\)\?webhookBase:`\$\{webhookBase\}\?token=\$\{areebaWebhookToken\(\)\}`/)
  assert.match(read('.env.example'), /^AREEBA_WEBHOOK_SECRET=$/m)
})

test('D2: delivery is priced on the merchandise before coins, and a coin-paid order says so', () => {
  assert.match(read('lib/checkout-totals.ts'), /await input\.shippingFor\(input\.discountedSubtotal\)/)
  const checkout = read('app/api/checkout/route.ts')
  assert.match(checkout, /const coveredBy = \[coinDiscount > 0 \? 'coins' : '', giftCardDiscount > 0 \? 'a gift card' : ''\]/)
  assert.match(checkout, /using \$\{coveredBy\}/)
})

test('D2: the estimates for the other delivery methods use the same threshold basis as the server', () => {
  const page = read('app/checkout/page.tsx')
  assert.match(page, /const merchandise = quote \? Math\.max\(0, quote\.subtotal - quote\.discount\) : subtotal/)
  assert.match(page, /merchandise >= rate\.freeAbove \? 0 : rate\.price/)
})

test('D3: the price summary allows 120 requests per 10 minutes per IP', () => {
  assert.match(read('app/api/checkout/quote/route.ts'), /consumeDurableRateLimit\(`checkout-quote:\$\{clientIp\(req\.headers\)\}`, 120, 10 \* 60 \* 1000\)/)
})
