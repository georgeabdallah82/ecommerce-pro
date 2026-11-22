import { db } from '@/lib/prisma'
import { openSecret } from '@/lib/two-step'
import { queueRetry, type DeliveryResult } from '@/lib/outbox'
import { collectsCashOnDelivery } from '@/lib/orders'
import { internationalPhone } from '@/lib/phone'
import { customerPhone, shippingAddress } from '@/lib/order-flow'
import { orderReviewPath, orderViewToken } from '@/lib/order-access'
import { money } from '@/lib/config'
import { WHATSAPP_LABELS, WHATSAPP_LANGUAGES, isArabicTemplate, templateWords, type WhatsAppUpdate } from '@/lib/whatsapp-templates'
import type { Lang } from '@/lib/i18n'
import { langFor } from '@/lib/message-lang'

// Automatic WhatsApp messages from the store's own WhatsApp number (WhatsApp Cloud API), for customers who ticked
// "Send my order updates on WhatsApp" at checkout: one when the order is confirmed, one when it is out for delivery,
// one when it is delivered. They say what the one-tap updates on the order page say (lib/order-updates.ts), in
// message templates the store creates once in WhatsApp Manager -- WhatsApp only lets a business start a chat with
// an approved template. Settings › Email & messaging › Automatic WhatsApp messages holds the number's ID, its access
// key (kept sealed, like the Meta Conversions API token) and the three template names; nothing is sent until the
// card is switched on. Each message is sent once per order: an order event marks it before it goes out and then
// says how it went, so staff see it on the order page. A failure that may pass (no answer, too many requests,
// Meta's server error) is tried again by the hourly job (lib/outbox.ts); a refusal is noted on the order. The texts
// to create and the words filled into them are in lib/whatsapp-templates.ts.
//
// Customers who shop in Arabic get the templates' Arabic version once the owner has added one in WhatsApp Manager
// and said so in Settings ("My templates also have an Arabic version"); if WhatsApp has no Arabic version of a
// template after all, that message goes out in the templates' main language (docs/arabic-messages-2026-11.md).
export type { WhatsAppUpdate }

export const WHATSAPP_KEYS = {
  enabled: 'whatsapp.cloud.enabled',
  phoneNumberId: 'whatsapp.cloud.phoneNumberId',
  token: 'whatsapp.cloud.accessToken',
  language: 'whatsapp.cloud.language',
  // 'true' once the three templates also have an Arabic version (language "ar") in WhatsApp Manager.
  arabicVersion: 'whatsapp.cloud.arabicVersion',
  templates: { confirmed: 'whatsapp.cloud.templateConfirmed', on_the_way: 'whatsapp.cloud.templateOnTheWay', delivered: 'whatsapp.cloud.templateDelivered' } as Record<WhatsAppUpdate, string>,
}
const ALL_KEYS = [WHATSAPP_KEYS.enabled, WHATSAPP_KEYS.phoneNumberId, WHATSAPP_KEYS.token, WHATSAPP_KEYS.language, WHATSAPP_KEYS.arabicVersion, ...Object.values(WHATSAPP_KEYS.templates)]

const marker = (kind: WhatsAppUpdate) => `WhatsApp message "${WHATSAPP_LABELS[kind]}"`

const GRAPH_VERSION = 'v23.0'
// Tests point this at a stand-in server; the live store always talks to Meta.
const apiBase = () => (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '')

export function whatsappUpdateForStatus(status: string): WhatsAppUpdate | null {
  if (status === 'CONFIRMED' || status === 'PROCESSING') return 'confirmed'
  if (status === 'SHIPPED') return 'on_the_way'
  if (status === 'DELIVERED') return 'delivered'
  return null
}

// Template names are lowercase letters, digits and underscores (as WhatsApp Manager makes them).
export function templateName(value: string | null | undefined) {
  const name = String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
  return /^[a-z0-9_]{1,512}$/.test(name) ? name : ''
}
export const templateLanguage = (value: string | null | undefined) => {
  const code = String(value || '').trim()
  return /^[a-z]{2,3}(_[A-Z]{2})?$/.test(code) ? code : 'en'
}

export async function whatsappCloudConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: [...ALL_KEYS, 'store.country'] } }, select: { key: true, value: true } })
  const map = new Map(rows.map(r => [r.key, r.value]))
  // A sealed key is opened here; a plain one saved before sealing still works (the daily job seals it).
  const stored = (map.get(WHATSAPP_KEYS.token) || '').trim()
  const token = stored.startsWith('v1.') ? ((await openSecret(stored)) || '') : stored
  if (stored.startsWith('v1.') && !token) console.error('[whatsapp] the saved access key cannot be read (the secret key changed); enter it again in Settings')
  const phoneNumberId = (map.get(WHATSAPP_KEYS.phoneNumberId) || '').replace(/\D/g, '')
  const templates = {
    confirmed: templateName(map.get(WHATSAPP_KEYS.templates.confirmed)),
    on_the_way: templateName(map.get(WHATSAPP_KEYS.templates.on_the_way)),
    delivered: templateName(map.get(WHATSAPP_KEYS.templates.delivered)),
  }
  const connected = !!phoneNumberId && !!token
  return { enabled: map.get(WHATSAPP_KEYS.enabled) === 'true', connected, phoneNumberId, token, language: templateLanguage(map.get(WHATSAPP_KEYS.language)), arabicVersion: map.get(WHATSAPP_KEYS.arabicVersion) === 'true', templates, storeCountry: map.get('store.country') || 'Lebanon' }
}

// The language a customer's messages go in: the Arabic version for a customer who shops in Arabic, once the owner
// has said the templates have one; otherwise the templates' main language.
export function whatsappLanguageFor(config: { language: string; arabicVersion: boolean }, lang: Lang) {
  return lang === 'ar' && config.arabicVersion && !isArabicTemplate(config.language) ? 'ar' : config.language
}
const languageLabel = (code: string) => WHATSAPP_LANGUAGES.find(l => l.code === code)?.label || code

// Whether checkout offers "Send my order updates on WhatsApp": switched on, connected and at least one message set
// up. Only checks that the values are there (the public settings call makes it), never reads them out.
export async function whatsappUpdatesOffered() {
  const rows = await db.setting.findMany({ where: { key: { in: ALL_KEYS } }, select: { key: true, value: true } })
  const map = new Map(rows.map(r => [r.key, r.value]))
  return map.get(WHATSAPP_KEYS.enabled) === 'true'
    && /\d/.test(map.get(WHATSAPP_KEYS.phoneNumberId) || '')
    && !!(map.get(WHATSAPP_KEYS.token) || '').trim()
    && Object.values(WHATSAPP_KEYS.templates).some(key => !!templateName(map.get(key)))
}

type MessageOrder = {
  orderNumber: string
  paymentStatus: string
  paymentMethod?: string | null
  phone?: string | null
  grandTotal: number
  currency: string
  shippingAddressJson?: string | null
  user?: { name?: string | null } | null
}

// A template value is one line: WhatsApp refuses new lines, tabs and long runs of spaces in them.
const oneLine = (value: string, max = 300) => value.replace(/\s+/g, ' ').trim().slice(0, max)

// The template's values, in order ({{1}}, {{2}}, ...), in the template's language. The wording around them is the
// template's (lib/whatsapp-templates.ts).
export function templateParams(kind: WhatsAppUpdate, order: MessageOrder, origin: string, language = 'en') {
  const words = templateWords(language)
  const a = shippingAddress(order.shippingAddressJson)
  const firstName = oneLine(String(a.firstName || order.user?.name || '').trim().split(/\s+/)[0] || '', 60) || words.there
  const number = oneLine(order.orderNumber, 60)
  const total = money(order.grandTotal, order.currency)
  const cod = collectsCashOnDelivery({ paymentMethod: String(order.paymentMethod || ''), paymentStatus: order.paymentStatus })
  const paid = order.paymentStatus === 'PAID'
  const site = origin.replace(/\/$/, '')
  const follow = `${site}/account/orders/${encodeURIComponent(order.orderNumber)}?t=${orderViewToken(order.orderNumber)}`
  if (kind === 'confirmed') return [firstName, number, `${total}${cod ? ` ${words.cashOnDelivery}` : paid ? ` ${words.paid}` : ''}`, follow]
  if (kind === 'on_the_way') return [firstName, number, cod ? `${total} ${words.inCash}` : paid ? words.alreadyPaid : total, follow]
  return [firstName, number, `${site}${orderReviewPath(order.orderNumber)}`]
}

// Meta's answers that mean "try again later"; anything else it refuses is noted on the order instead.
// 1/2: temporary problem on Meta's side, 4/80007/130429/131056: too many messages, 131000: something went wrong,
// 131016: service unavailable, 131057: account in maintenance.
const TRANSIENT_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131056, 131057])
export function whatsappFailureIsPermanent(status: number, code = 0) {
  if (code) return !TRANSIENT_CODES.has(code)
  return !(status === 0 || status === 408 || status === 429 || status >= 500)
}

// The refusals staff are most likely to see, in words that say what to do.
const PLAIN_ERRORS: Record<number, string> = {
  0: 'the access key was refused; save a new one in Settings',
  10: 'the access key is missing the WhatsApp permission; make a new one with whatsapp_business_messaging',
  190: 'the access key has expired; save a new one in Settings',
  131026: 'the customer cannot receive it (the number is not on WhatsApp, or their app is too old)',
  131030: 'this number is not on the test list of the WhatsApp test number; add it in Meta, or connect the live number',
  131031: 'the WhatsApp account is locked; check WhatsApp Manager',
  131042: 'there is a payment problem on the WhatsApp account; check the billing in Meta',
  132000: 'the template expects a different number of values; check its wording against the guide',
  132001: 'the template was not found; check its name and language in Settings',
  132015: 'Meta paused the template; check it in WhatsApp Manager',
  132016: 'Meta turned the template off; check it in WhatsApp Manager',
  133010: "the store's WhatsApp number is not registered with the Cloud API yet",
  368: 'the WhatsApp account is temporarily blocked for a policy issue; check WhatsApp Manager',
}

export type OutgoingWhatsApp = { to: string; template: string; language: string; params: string[] }

export async function deliverWhatsApp(config: { phoneNumberId: string; token: string }, message: OutgoingWhatsApp, timeoutMs = 10000): Promise<DeliveryResult & { messageId?: string; code?: number }> {
  try {
    const res = await fetch(`${apiBase()}/${GRAPH_VERSION}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.to,
        type: 'template',
        template: {
          name: message.template,
          language: { code: message.language },
          ...(message.params.length ? { components: [{ type: 'body', parameters: message.params.map(text => ({ type: 'text', text })) }] } : {}),
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json().catch(() => null) as { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string; error_data?: { details?: string } } } | null
    const messageId = data?.messages?.[0]?.id
    if (res.ok && messageId) return { ok: true, messageId }
    // Accepted without a message id: not tried again, so a customer never gets it twice.
    if (res.ok) return { ok: false, error: 'WhatsApp answered without a message id', permanent: true }
    // Plain words only for a code WhatsApp gave: an answer without one (a bare 500 page) is not "the key was refused" (0).
    const rawCode = data?.error?.code
    const code = rawCode == null ? 0 : Number(rawCode) || 0
    const plain = rawCode == null ? undefined : PLAIN_ERRORS[code]
    const said = String(data?.error?.error_data?.details || data?.error?.message || `HTTP ${res.status}`).replace(/\s+/g, ' ').trim().slice(0, 300)
    return { ok: false, error: plain ? `${plain} (WhatsApp code ${code})` : `WhatsApp said: ${said}${code ? ` (code ${code})` : ''}`, permanent: whatsappFailureIsPermanent(res.status, code), ...(code ? { code } : {}) }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, error: timedOut ? 'WhatsApp did not answer in time' : `Could not reach WhatsApp: ${error instanceof Error ? error.message : String(error)}`, permanent: false }
  }
}

// `fallback`: the same message in the templates' main language, for a message sent in their Arabic version.
type QueuedWhatsApp = OutgoingWhatsApp & { eventId: string; orderId: string; kind: WhatsAppUpdate; fallback?: { language: string; params: string[] } }

// WhatsApp's answer when it has no template by that name in that language.
const TEMPLATE_NOT_FOUND = 132001

// Sends the message; one in the templates' Arabic version that WhatsApp does not have goes out in their main
// language instead, so the customer still gets it.
export async function deliverWithFallback(config: { phoneNumberId: string; token: string }, message: OutgoingWhatsApp & { fallback?: { language: string; params: string[] } }): Promise<DeliveryResult & { fellBackTo?: string }> {
  const first = await deliverWhatsApp(config, message)
  if (first.ok || first.code !== TEMPLATE_NOT_FOUND || !message.fallback) return first
  const second = await deliverWhatsApp(config, { to: message.to, template: message.template, language: message.fallback.language, params: message.fallback.params })
  return { ...second, fellBackTo: message.fallback.language }
}

// The order event says how it went; staff read it on the order page.
async function noteOutcome(message: QueuedWhatsApp, result: DeliveryResult & { fellBackTo?: string }, final: boolean) {
  const text = result.ok
    ? result.fellBackTo
      ? `${marker(message.kind)} sent to +${message.to} in ${languageLabel(result.fellBackTo)}: the template has no Arabic version in WhatsApp Manager yet.`
      : `${marker(message.kind)} sent to +${message.to}${isArabicTemplate(message.language) ? ' in Arabic' : ''}.`
    : final
      ? `${marker(message.kind)} not sent: ${result.error || 'failed'}.`
      : `${marker(message.kind)} not sent yet: ${result.error || 'failed'}. It will be tried again.`
  await db.orderEvent.update({ where: { id: message.eventId }, data: { message: text.slice(0, 1000) } }).catch(error => console.error('[whatsapp] could not note the outcome on the order', error))
}

export type WhatsAppSendResult = { status: 'sent' | 'queued' | 'failed' | 'skipped'; reason?: string }

// Called once an order's status has changed (admin order page, a shipment marked delivered, a driver's "Delivered").
// `origin` is the store's address for the links in the message.
export async function sendOrderWhatsApp(orderId: string, status: string, origin: string): Promise<WhatsAppSendResult> {
  const kind = whatsappUpdateForStatus(status)
  if (!kind) return { status: 'skipped', reason: 'no message for this status' }
  const config = await whatsappCloudConfig()
  if (!config.enabled || !config.connected) return { status: 'skipped', reason: 'automatic WhatsApp messages are off' }
  const template = config.templates[kind]
  if (!template) return { status: 'skipped', reason: 'no template set for this message' }
  if (!origin) return { status: 'skipped', reason: 'no store address for the links' }
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, phone: true, grandTotal: true, currency: true, shippingAddressJson: true, whatsappUpdates: true, lang: true, userId: true, email: true, user: { select: { name: true } } },
  })
  if (!order || !order.whatsappUpdates) return { status: 'skipped', reason: 'the customer did not ask for WhatsApp updates' }
  // Once per message per order: confirming and then preparing an order, or a second tap, sends nothing more.
  const earlier = await db.orderEvent.findFirst({ where: { orderId: order.id, message: { startsWith: marker(kind) } }, select: { id: true } })
  if (earlier) return { status: 'skipped', reason: 'already sent for this order' }
  const to = internationalPhone(customerPhone(order), config.storeCountry)
  if (!to) {
    await db.orderEvent.create({ data: { orderId: order.id, status: order.status, message: `${marker(kind)} not sent: the order has no valid mobile number.` } })
    return { status: 'failed', reason: 'no valid mobile number' }
  }
  const event = await db.orderEvent.create({ data: { orderId: order.id, status: order.status, message: `${marker(kind)}: sending…` } })
  // In the customer's language when the templates have it (docs/arabic-messages-2026-11.md).
  const language = whatsappLanguageFor(config, await langFor(order))
  const fallback = language === config.language ? undefined : { language: config.language, params: templateParams(kind, order, origin, config.language) }
  const message: QueuedWhatsApp = { eventId: event.id, orderId: order.id, kind, to, template, language, params: templateParams(kind, order, origin, language), ...(fallback ? { fallback } : {}) }
  const result = await deliverWithFallback(config, message)
  await noteOutcome(message, result, result.ok || !!result.permanent)
  if (result.ok) return { status: 'sent' }
  if (!result.permanent) {
    await queueRetry('whatsapp', message, result.error || 'Failed')
    return { status: 'queued', reason: result.error || undefined }
  }
  return { status: 'failed', reason: result.error || undefined }
}

// The hourly job's try (lib/outbox.ts). The access key is read from Settings each time, never kept with the message.
export async function retryQueuedWhatsApp(message: QueuedWhatsApp, lastTry = false): Promise<DeliveryResult> {
  const config = await whatsappCloudConfig()
  if (!config.enabled || !config.connected) {
    const result = { ok: false, error: 'automatic WhatsApp messages were switched off or disconnected in Settings', permanent: true }
    await noteOutcome(message, result, true)
    return result
  }
  const result = await deliverWithFallback(config, message)
  await noteOutcome(message, result, result.ok || !!result.permanent || lastTry)
  return result
}
