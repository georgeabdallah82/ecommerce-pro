import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { sendEmail } from '@/lib/email'
import { codeHash, isPlaceholderEmail, newCode, placeholderEmail } from '@/lib/phone-sign-in'
import { deliverWhatsApp, sendLoginCodeWhatsApp } from '@/lib/whatsapp-cloud'
import { POST as start } from '@/app/api/auth/phone/start/route'
import { POST as verify } from '@/app/api/auth/phone/verify/route'

process.env.AUTH_SECRET ||= 'test-secret-for-phone-sign-in'

// Sign in with a WhatsApp code (docs/phone-sign-in-2026-11.md). The whole flow was also run against PostgreSQL and a
// stand-in WhatsApp server.
const read = (path: string) => readFileSync(path, 'utf8')
let savedFetch: typeof fetch
beforeEach(() => { savedFetch = global.fetch })
afterEach(() => { global.fetch = savedFetch })
const post = (handler: (req: Request) => Promise<Response>, body: unknown) => handler(new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('codes', () => {
  it('six digits, kept only as a keyed hash of the number and the code', () => {
    for (let i = 0; i < 50; i++) assert.match(newCode(), /^\d{6}$/)
    assert.equal(codeHash('96170123456', '123456'), codeHash('96170123456', '123456'))
    assert.notEqual(codeHash('96170123456', '123456'), codeHash('96171123456', '123456'), 'the same code for another number does not match')
    assert.notEqual(codeHash('96170123456', '123456'), codeHash('96170123456', '123457'))
    assert.doesNotMatch(codeHash('96170123456', '123456'), /123456/)
  })
  it('sent with the template\'s "Copy code" button; the Arabic version for Arabic shoppers, else the main language', async () => {
    const calls: any[] = []
    global.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      calls.push(body)
      if (body.template.language.code === 'ar') return new Response(JSON.stringify({ error: { code: 132001, message: 'no Arabic' } }), { status: 404 })
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })
    }) as typeof fetch
    const config = { phoneNumberId: '1065', token: 'key', language: 'en', arabicVersion: true, templates: { login: 'login_code' } }
    const result = await sendLoginCodeWhatsApp(config, { to: '96170123456', code: '482913', lang: 'ar' })
    assert.equal(result.ok, true)
    assert.deepEqual(calls.map(c => c.template.language.code), ['ar', 'en'])
    for (const call of calls) {
      assert.equal(call.template.name, 'login_code')
      assert.deepEqual(call.template.components, [
        { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
      ])
    }
    // Other messages are unchanged: no button.
    calls.length = 0
    await deliverWhatsApp(config, { to: '96170123456', template: 'order_confirmed', language: 'en', params: ['Sara'] })
    assert.deepEqual(calls[0].template.components, [{ type: 'body', parameters: [{ type: 'text', text: 'Sara' }] }])
  })
})

describe('accounts', () => {
  it('a new account by phone has a placeholder address that never gets email', async () => {
    assert.equal(placeholderEmail('96170123456'), '96170123456@phone.invalid')
    assert.equal(isPlaceholderEmail('96170123456@Phone.Invalid'), true)
    assert.equal(isPlaceholderEmail('sara@example.com'), false)
    const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM }
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'orders@example.com'
    let called = false
    global.fetch = (async () => { called = true; return new Response('{}') }) as typeof fetch
    const result = await sendEmail('96170123456@phone.invalid', 'Hello', '<p>x</p>', 'x')
    assert.deepEqual(result, { sent: false, skipped: true })
    assert.equal(called, false)
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key
    if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from
    assert.match(read('app/api/auth/session/route.ts'), /email: isPlaceholderEmail\(user\.email\) \? '' : user\.email/)
  })
  it('customers only: a staff account is never signed in by a phone code (their 2-step code can\'t be skipped)', () => {
    const src = read('lib/phone-sign-in.ts')
    assert.match(src, /if \(account && \(account\.role !== 'CUSTOMER' \|\| !account\.isActive\)\) return \{ ok: false, status: 403/)
    // The session is set only after a right code.
    const route = read('app/api/auth/phone/verify/route.ts')
    assert.match(route, /if \(!result\.ok\) return json\(\{ error: result\.error \}, \{ status: result\.status, headers \}\)\n\s+await setSession\(result\.userId\)/)
  })
  it('the account is the one a code sign-in made, never one that only has the number typed in its profile', () => {
    const src = read('lib/phone-sign-in.ts')
    assert.match(src, /db\.user\.findUnique\(\{ where: \{ email: placeholderEmail\(phone\) \}/)
    assert.doesNotMatch(src, /db\.user\.findMany\(/, 'no search of accounts by their typed phone')
    // Guest orders with the number join the account; numbers typed with spaces or dashes still match.
    assert.match(src, /regexp_replace\(coalesce\("phone", ''\), '\[\^0-9\]', '', 'g'\) LIKE/)
    assert.match(src, /internationalPhone\(customerPhone\(\{ phone: o\.phone, shippingAddressJson: o\.shippingAddressJson \}\), country\) === phone/)
  })
})

describe('limits', () => {
  it('per address, per number, per day and for the whole store; wrong codes lock the number for an hour', () => {
    const src = read('lib/phone-sign-in.ts')
    assert.match(src, /\[`phone-code:ip:\$\{ip\}`, 10, HOUR\], \[`phone-code:number:\$\{phone\}`, 3, 15 \* 60_000\], \[`phone-code:day:\$\{phone\}`, 10, 24 \* HOUR\], \['phone-code:store', 300, 24 \* HOUR\]\]/)
    assert.equal((src.match(/if \(await durableLimitReached\(/g) || []).length, 2, 'checked before sending and before checking a code')
    assert.match(src, /export const PHONE_CODE_TRIES = 5/)
    assert.match(src, /export const PHONE_CODE_TTL_MS = 10 \* 60_000/)
    // Used once: deleted when right, and on the fifth wrong try.
    assert.match(src, /\/\/ Used once\.\n\s+await db\.phoneLoginCode\.deleteMany\(\{ where: \{ phone \} \}\)/)
  })
  it('off until the store sets up the template; a bad number or a missing code is refused', async () => {
    const off = await post(start, { phone: '70 123 456' })
    assert.equal(off.status, 404, 'no WhatsApp set up: not offered')
    assert.equal((await post(verify, { phone: 'not a number', code: '123456' })).status, 400)
    assert.equal((await post(verify, { phone: '70 123 456', code: '123456' })).status, 400, 'no code was sent')
    const page = read('app/account/login/page.tsx')
    assert.match(page, /\{phoneOffered && <><p className="authDivider">\{t\('or'\)\}<\/p><PhoneSignIn next=\{next\} \/><\/>\}/)
  })
  it('Settings has the template and can send a test code', () => {
    assert.match(read('components/settings-center-pro.tsx'), /set\('whatsapp\.cloud\.templateLogin', waTemplateInput\(v\)\)/)
    assert.match(read('app/api/admin/whatsapp/test/route.ts'), /login \? \{ to, template, language, params: \['123456'\], otpButton: '123456' \}/)
    assert.match(read('app/admin/settings/page.tsx'), /'whatsapp\.cloud\.templateLogin',/)
  })
})
