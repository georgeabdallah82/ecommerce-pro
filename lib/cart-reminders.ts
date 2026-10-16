import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/prisma'

// Automatic cart reminder emails: a shopper who typed their email at checkout and left without
// ordering gets ONE reminder, a few hours later. Off until the owner turns it on (Operations >
// Orders > Abandoned checkouts). Deliberately cautious:
//  - one reminder per checkout, ever, and none to an address reminded in the last 7 days;
//  - never when the address ordered since, unsubscribed, or looks invalid, when nothing in the
//    cart can still be bought, or when the checkout is older than the "too late" limit;
//  - at most `dailyLimit` a day, a few per run;
//  - no timer of its own (the database sleeps when the store is quiet): the check runs at most
//    every 15 minutes, piggybacking on requests that already use the database (a checkout
//    step, a new order, staff opening the admin). A quiet store's reminders simply go out a
//    little later.
//  - each checkout is claimed with one conditional update before sending, so two requests
//    running the check at once can never both send.

export const REMINDER_SETTING_KEYS = { enabled: 'abandoned.autoSend', delayHours: 'abandoned.delayHours', maxAgeHours: 'abandoned.maxAgeHours', dailyLimit: 'abandoned.dailyLimit' } as const
export type ReminderSettings = { enabled: boolean; delayHours: number; maxAgeHours: number; dailyLimit: number }
export const REMINDER_DEFAULTS: ReminderSettings = { enabled: false, delayHours: 3, maxAgeHours: 48, dailyLimit: 20 }
export const SWEEP_EVERY_MS = 15 * 60 * 1000
const PER_RUN = 5
const REMIND_SAME_EMAIL_DAYS = 7
const LAST_SWEEP_KEY = 'abandoned.lastReminderRun'

const clampInt = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const n = Math.trunc(Number(raw))
  return raw != null && raw !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function readReminderSettings(values: Record<string, string | undefined>): ReminderSettings {
  const delayHours = clampInt(values[REMINDER_SETTING_KEYS.delayHours], 1, 48, REMINDER_DEFAULTS.delayHours)
  return {
    enabled: values[REMINDER_SETTING_KEYS.enabled] === 'true',
    delayHours,
    maxAgeHours: Math.max(delayHours + 1, clampInt(values[REMINDER_SETTING_KEYS.maxAgeHours], 2, 168, REMINDER_DEFAULTS.maxAgeHours)),
    dailyLimit: clampInt(values[REMINDER_SETTING_KEYS.dailyLimit], 1, 200, REMINDER_DEFAULTS.dailyLimit),
  }
}

export async function loadReminderSettings() {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(REMINDER_SETTING_KEYS) } } })
  return readReminderSettings(Object.fromEntries(rows.map(r => [r.key, r.value])))
}

// Checkouts last touched between maxAge and delay ago are due for a reminder.
export function reminderWindow(now: Date, settings: ReminderSettings) {
  return { from: new Date(now.getTime() - settings.maxAgeHours * 3600_000), to: new Date(now.getTime() - settings.delayHours * 3600_000) }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const normalizeEmail = (email: string | null | undefined) => String(email || '').trim().toLowerCase()
export const isSendableEmail = (email: string | null | undefined) => { const e = normalizeEmail(email); return e.length <= 190 && EMAIL.test(e) }

export type ReminderFacts = {
  email: string | null
  lastActivity: Date
  optedOut: boolean
  orderedSince: boolean
  purchasableItems: number
  remindedRecently: boolean
}

// Why a checkout must not get a reminder; empty when it may.
export function reminderSkipReason(facts: ReminderFacts, now: Date, settings: ReminderSettings) {
  if (!isSendableEmail(facts.email)) return 'No valid email address'
  if (facts.orderedSince) return 'Already ordered'
  if (facts.optedOut) return 'Unsubscribed from cart reminders'
  const age = now.getTime() - facts.lastActivity.getTime()
  if (age > settings.maxAgeHours * 3600_000) return 'Too old to remind'
  if (age < settings.delayHours * 3600_000) return 'Too early'
  if (facts.purchasableItems === 0) return 'Nothing in the cart can be bought now'
  if (facts.remindedRecently) return 'Reminded in the last 7 days'
  return ''
}

// ---- Unsubscribe link: the checkout id, signed so nobody can unsubscribe someone else ----

function secret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return raw
}
export function unsubscribeToken(checkoutId: string) {
  return createHmac('sha256', secret()).update(`cart-reminder-unsubscribe:${checkoutId}`).digest('base64url').slice(0, 32)
}
export function isValidUnsubscribeToken(checkoutId: string, token: string | null | undefined) {
  if (!checkoutId || !token) return false
  try {
    const expected = Buffer.from(unsubscribeToken(checkoutId))
    const given = Buffer.from(String(token))
    return expected.length === given.length && timingSafeEqual(expected, given)
  } catch { return false }
}
// The page the email links to (it asks before unsubscribing, so mail scanners that open links
// can't unsubscribe anyone) and the address mail apps' own "Unsubscribe" button posts to.
export function unsubscribeUrls(siteUrl: string, checkoutId: string) {
  if (!siteUrl) return { unsubscribeUrl: '', oneClickUnsubscribeUrl: '' }
  const query = `c=${encodeURIComponent(checkoutId)}&t=${unsubscribeToken(checkoutId)}`
  const base = siteUrl.replace(/\/$/, '')
  return { unsubscribeUrl: `${base}/unsubscribe?${query}`, oneClickUnsubscribeUrl: `${base}/api/unsubscribe?${query}` }
}

export async function optOutEmail(email: string, source = 'cart_reminder') {
  const normalized = normalizeEmail(email)
  if (!normalized) return
  await db.emailOptOut.upsert({ where: { email: normalized }, update: {}, create: { email: normalized, source } })
  // Pending reminders for that address are dropped too.
  await db.abandonedCheckout.updateMany({ where: { email: { equals: normalized, mode: 'insensitive' }, reminderState: null }, data: { reminderState: 'skipped', reminderAt: new Date(), reminderNote: 'Unsubscribed from cart reminders' } })
}

export async function isOptedOut(email: string | null | undefined) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  return !!(await db.emailOptOut.findUnique({ where: { email: normalized } }))
}

// An order placed with this address closes its open checkouts at once: the checkout page also
// reports it, but from the shopper's browser, which may never arrive.
// phone: international digits (lib/phone.ts internationalPhone), as saved by checkout.
export async function markCheckoutsRecovered(email: string | null | undefined, phone?: string | null) {
  const normalized = normalizeEmail(email)
  const match = [...(normalized ? [{ email: { equals: normalized, mode: 'insensitive' as const } }] : []), ...(phone ? [{ phone }] : [])]
  if (!match.length) return
  await db.abandonedCheckout.updateMany({ where: { status: 'OPEN', OR: match }, data: { status: 'RECOVERED', recoveredAt: new Date() } })
}

// ---- The check ----

type Sender = (checkoutId: string, options: { automatic: true; unsubscribeUrl: string; oneClickUnsubscribeUrl: string }) => Promise<{ sent: boolean; skipped?: boolean }>

export async function sendDueCartReminders(send: Sender, now = new Date(), settingsOverride?: ReminderSettings) {
  const settings = settingsOverride ?? await loadReminderSettings()
  const result = { checked: 0, sent: 0, skipped: 0, failed: 0 }
  if (!settings.enabled) return result
  const sentToday = await db.abandonedCheckout.count({ where: { reminderState: 'sent', reminderAt: { gte: new Date(now.getTime() - 24 * 3600_000) } } })
  const room = Math.min(PER_RUN, settings.dailyLimit - sentToday)
  if (room <= 0) return result
  const { from, to } = reminderWindow(now, settings)
  const due = await db.abandonedCheckout.findMany({
    where: { status: 'OPEN', reminderState: null, email: { not: null }, lastActivity: { gte: from, lte: to } },
    orderBy: { lastActivity: 'asc' },
    take: room,
    select: { id: true },
  })
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  for (const { id } of due) {
    // Claim it: only the request whose update changed the row goes on to send.
    const claimed = await db.abandonedCheckout.updateMany({ where: { id, status: 'OPEN', reminderState: null }, data: { reminderState: 'sending', reminderAt: now } })
    if (claimed.count !== 1) continue
    result.checked += 1
    const checkout = await db.abandonedCheckout.findUnique({ where: { id } })
    if (!checkout) continue
    const email = normalizeEmail(checkout.email)
    let items: Array<{ productId?: string; variantId?: string | null }> = []
    try { items = JSON.parse(checkout.cartJson || '[]') } catch { items = [] }
    const productIds = [...new Set(items.map(i => String(i.productId || '')).filter(Boolean))]
    const [optedOut, order, purchasable, reminded] = await Promise.all([
      isOptedOut(email),
      email ? db.order.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, createdAt: { gte: new Date(checkout.createdAt.getTime() - 60_000) } }, select: { id: true } }) : null,
      productIds.length ? db.product.count({ where: { id: { in: productIds }, status: 'ACTIVE' } }) : 0,
      email ? db.abandonedCheckout.findFirst({ where: { id: { not: id }, email: { equals: email, mode: 'insensitive' }, reminderState: 'sent', reminderAt: { gte: new Date(now.getTime() - REMIND_SAME_EMAIL_DAYS * 86400_000) } }, select: { id: true } }) : null,
    ])
    const reason = reminderSkipReason({ email, lastActivity: checkout.lastActivity, optedOut, orderedSince: !!order, purchasableItems: purchasable, remindedRecently: !!reminded }, now, settings)
    if (reason) {
      await db.abandonedCheckout.update({ where: { id }, data: { reminderState: 'skipped', reminderNote: reason, ...(order ? { status: 'RECOVERED', recoveredAt: now } : {}) } })
      result.skipped += 1
      continue
    }
    const outcome = await send(id, { automatic: true, ...unsubscribeUrls(site, id) }).catch(error => { console.error('[cart-reminders] send failed', error); return { sent: false } })
    await db.abandonedCheckout.update({ where: { id }, data: outcome.sent ? { reminderState: 'sent', reminderAt: new Date(), reminderNote: null } : { reminderState: 'failed', reminderNote: 'The email could not be sent (see Website status > Emails)' } })
    if (outcome.sent) result.sent += 1
    else result.failed += 1
  }
  if (result.checked) console.log('[cart-reminders]', JSON.stringify(result))
  return result
}

// The setting is read at most once a minute per Worker instance, and the check itself runs at
// most every 15 minutes across all of them (one conditional update decides who runs it).
let enabledCache: { value: boolean; until: number } | null = null
export function resetReminderCache() { enabledCache = null }

export async function maybeSendCartReminders(send: Sender, now = new Date()) {
  try {
    if (!enabledCache || enabledCache.until < now.getTime()) {
      const row = await db.setting.findUnique({ where: { key: REMINDER_SETTING_KEYS.enabled } })
      enabledCache = { value: row?.value === 'true', until: now.getTime() + 60_000 }
    }
    if (!enabledCache.value) return null
    const stamp = now.toISOString()
    const before = new Date(now.getTime() - SWEEP_EVERY_MS).toISOString()
    const took = await db.setting.updateMany({ where: { key: LAST_SWEEP_KEY, value: { lt: before } }, data: { value: stamp } })
    if (took.count !== 1) {
      const exists = await db.setting.findUnique({ where: { key: LAST_SWEEP_KEY } })
      if (exists) return null
      try { await db.setting.create({ data: { key: LAST_SWEEP_KEY, value: stamp } }) } catch { return null }
    }
    return await sendDueCartReminders(send, now)
  } catch (error) {
    console.error('[cart-reminders] check failed', error)
    return null
  }
}
