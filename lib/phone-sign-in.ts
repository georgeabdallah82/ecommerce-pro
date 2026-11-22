import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { markT, type Lang } from '@/lib/i18n'
import { internationalPhone } from '@/lib/phone'
import { customerPhone, shippingAddress } from '@/lib/order-flow'
import { consumeDurableRateLimit, clearDurableRateLimit, durableLimitReached } from '@/lib/rate-limit'
import { sendLoginCodeWhatsApp, whatsappCloudConfig } from '@/lib/whatsapp-cloud'

// Sign in with a WhatsApp code (docs/phone-sign-in-2026-11.md). Many customers order with a phone number and no
// email: they type their mobile number on the sign-in page, get a 6-digit code on WhatsApp (an Authentication
// template the store creates once in WhatsApp Manager) and are signed in.
//
// - Customers only. A staff account is never signed in this way: staff sign in with their password and their 2-step
//   code (app/admin-login), and a phone code must not get around that.
// - The number decides the account: the account an earlier code sign-in made for it, else a new one. Never an account
//   that only has the number typed in its profile: nobody checked that number, and someone could type another
//   person's number to get their orders. A new account has no email, so it gets a placeholder address at
//   "phone.invalid", a name that can't receive mail (lib/email.ts sends nothing there), and no usable password.
// - Orders placed as a guest with that number are added to the account, so its order history is there at once.
// - Codes are kept as keyed hashes, for 10 minutes and 5 tries; only the latest one per number works.
// - Limits, so nobody can run up the store's WhatsApp bill or guess codes: per number 3 codes in 15 minutes and 10 a
//   day, per address 10 an hour, 300 a day for the whole store; 10 wrong codes in an hour lock the number for that hour.

export const PHONE_CODE_TTL_MS = 10 * 60_000
export const PHONE_CODE_TRIES = 5
export const PHONE_WRONG_CODES_LOCK = 10
const HOUR = 60 * 60_000
const PLACEHOLDER_DOMAIN = 'phone.invalid'

export const placeholderEmail = (digits: string) => `${digits}@${PLACEHOLDER_DOMAIN}`
export const isPlaceholderEmail = (email: string | null | undefined) => String(email || '').toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`)

// What the customer reads (translated in the browser, lib/i18n-ar.ts).
export const PHONE_MESSAGES = {
  badNumber: markT('Enter a mobile number that has WhatsApp, e.g. 70 123 456.'),
  tooMany: markT('Too many codes were asked for. Please try again later.'),
  locked: markT('Too many wrong codes. Please try again in an hour.'),
  notSent: markT('We could not send the code on WhatsApp. Please try again in a minute.'),
  expired: markT('This code has expired. Send a new one.'),
  wrong: markT('That code is not right. Check it and try again.'),
  notHere: markT('This number can\'t sign in with a code. Sign in with your email and password.'),
  off: markT('Signing in with WhatsApp is not available right now.'),
}

type Failure = { ok: false; status: number; error: string }
type Started = { ok: true; phone: string }
type Verified = { ok: true; userId: string; created: boolean; ordersLinked: number }

function secret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return raw
}
export const codeHash = (phone: string, code: string) => createHmac('sha256', secret()).update(`phone-code:${phone}:${code}`).digest('hex')
const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

async function storeCountry() {
  return (await db.setting.findUnique({ where: { key: 'store.country' } }))?.value || 'Lebanon'
}

// Offered on the sign-in page once automatic WhatsApp messages are on and connected, and the code's template is set.
export async function phoneSignInOffered() {
  const config = await whatsappCloudConfig().catch(() => null)
  return !!(config?.enabled && config.connected && config.templates.login)
}

export async function normalizedPhone(typed: unknown) {
  const raw = String(typed ?? '').slice(0, 40)
  return raw.trim() ? internationalPhone(raw, await storeCountry()) : ''
}

export async function startPhoneSignIn(typed: unknown, ip: string, lang: Lang): Promise<Started | Failure> {
  const config = await whatsappCloudConfig().catch(() => null)
  if (!config?.enabled || !config.connected || !config.templates.login) return { ok: false, status: 404, error: PHONE_MESSAGES.off }
  const phone = await normalizedPhone(typed)
  if (!phone) return { ok: false, status: 400, error: PHONE_MESSAGES.badNumber }
  if (await durableLimitReached(`phone-code-wrong:${phone}`, PHONE_WRONG_CODES_LOCK)) return { ok: false, status: 429, error: PHONE_MESSAGES.locked }
  for (const [key, limit, windowMs] of [[`phone-code:ip:${ip}`, 10, HOUR], [`phone-code:number:${phone}`, 3, 15 * 60_000], [`phone-code:day:${phone}`, 10, 24 * HOUR], ['phone-code:store', 300, 24 * HOUR]] as const) {
    if (!(await consumeDurableRateLimit(key, limit, windowMs)).allowed) return { ok: false, status: 429, error: PHONE_MESSAGES.tooMany }
  }
  const code = newCode()
  await db.phoneLoginCode.deleteMany({ where: { phone } })
  const row = await db.phoneLoginCode.create({ data: { phone, codeHash: codeHash(phone, code), expiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS) } })
  const sent = await sendLoginCodeWhatsApp(config, { to: phone, code, lang })
  if (!sent.ok) {
    await db.phoneLoginCode.deleteMany({ where: { id: row.id } })
    console.error('[phone-sign-in] the code could not be sent', sent.error)
    return { ok: false, status: 502, error: PHONE_MESSAGES.notSent }
  }
  return { ok: true, phone }
}

// Orders placed with this number: the order's phone, or its delivery address's. Phones are kept as typed ("70 123
// 456", "+961 70-123-456"), so the database compares their digits' ending, and each match is checked in full here.
async function ordersWithNumber(phone: string, country: string, guestOnly: boolean) {
  const ending = phone.slice(-7)
  const rows = await db.$queryRaw<Array<{ id: string; phone: string | null; shippingAddressJson: string; createdAt: Date }>>`
    SELECT "id", "phone", "shippingAddressJson", "createdAt" FROM "Order"
    WHERE (${!guestOnly} OR "userId" IS NULL)
      AND (regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') LIKE ${'%' + ending}
        OR regexp_replace(coalesce(substring("shippingAddressJson" from '"phone":"([^"]*)"'), ''), '[^0-9]', '', 'g') LIKE ${'%' + ending})
    ORDER BY "createdAt" DESC LIMIT 500`
  return rows.filter(o => internationalPhone(customerPhone({ phone: o.phone, shippingAddressJson: o.shippingAddressJson }), country) === phone)
}

// Guest orders placed with this number, added to the account.
async function linkGuestOrders(userId: string, phone: string, country: string) {
  const mine = (await ordersWithNumber(phone, country, true)).map(o => o.id)
  if (!mine.length) return 0
  return (await db.order.updateMany({ where: { id: { in: mine }, userId: null }, data: { userId } })).count
}

export async function verifyPhoneSignIn(typed: unknown, typedCode: unknown, ip: string): Promise<Verified | Failure> {
  const phone = await normalizedPhone(typed)
  if (!phone) return { ok: false, status: 400, error: PHONE_MESSAGES.badNumber }
  const wrongKey = `phone-code-wrong:${phone}`
  if (await durableLimitReached(wrongKey, PHONE_WRONG_CODES_LOCK)) return { ok: false, status: 429, error: PHONE_MESSAGES.locked }
  if (!(await consumeDurableRateLimit(`phone-verify:ip:${ip}`, 30, HOUR)).allowed) return { ok: false, status: 429, error: PHONE_MESSAGES.tooMany }
  const code = String(typedCode ?? '').replace(/\D/g, '').slice(0, 6)
  const row = await db.phoneLoginCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } })
  if (!row || row.expiresAt <= new Date() || row.attempts >= PHONE_CODE_TRIES) {
    if (row) await db.phoneLoginCode.deleteMany({ where: { phone } })
    return { ok: false, status: 400, error: PHONE_MESSAGES.expired }
  }
  if (code.length !== 6 || !sameHash(codeHash(phone, code), row.codeHash)) {
    await db.phoneLoginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } }).catch(() => undefined)
    await consumeDurableRateLimit(wrongKey, PHONE_WRONG_CODES_LOCK + 1, HOUR)
    return { ok: false, status: 400, error: row.attempts + 1 >= PHONE_CODE_TRIES ? PHONE_MESSAGES.expired : PHONE_MESSAGES.wrong }
  }
  // Used once.
  await db.phoneLoginCode.deleteMany({ where: { phone } })
  await clearDurableRateLimit(wrongKey)

  const country = await storeCountry()
  // The account an earlier code sign-in made for this number. Never a staff account: staff sign in with their
  // password and 2-step code, also if a customer account was later made staff.
  const account = await db.user.findUnique({ where: { email: placeholderEmail(phone) }, select: { id: true, role: true, isActive: true } })
  if (account && (account.role !== 'CUSTOMER' || !account.isActive)) return { ok: false, status: 403, error: PHONE_MESSAGES.notHere }

  let userId = account?.id
  let created = false
  if (!userId) {
    // The name from their latest order with this number, if any.
    const theirs = (await ordersWithNumber(phone, country, false))[0]
    const address = theirs ? shippingAddress(theirs.shippingAddressJson) : {}
    const name = [address.firstName, address.lastName].map(v => String(v || '').trim()).filter(Boolean).join(' ').slice(0, 80) || `+${phone}`
    try {
      const user = await db.user.create({ data: { name, email: placeholderEmail(phone), phone: `+${phone}`, passwordHash: await hashPassword(randomBytes(32).toString('hex')) } })
      userId = user.id
      created = true
    } catch {
      // Made a moment ago by another tab: use it.
      const existing = await db.user.findUnique({ where: { email: placeholderEmail(phone) }, select: { id: true, role: true, isActive: true } })
      if (!existing || existing.role !== 'CUSTOMER' || !existing.isActive) return { ok: false, status: 403, error: PHONE_MESSAGES.notHere }
      userId = existing.id
    }
  }
  const ordersLinked = await linkGuestOrders(userId, phone, country)
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
  return { ok: true, userId, created, ordersLinked }
}
