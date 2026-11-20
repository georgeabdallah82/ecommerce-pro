import { createHash } from 'node:crypto'
import { db } from '@/lib/prisma'
import { cleanTrackingIds } from '@/lib/tracking'
import { internationalPhone, isLebanon } from '@/lib/phone'
import { SESSION_COOKIE } from '@/lib/visitor-tracking'
import { openSecret } from '@/lib/two-step'
import { queueRetry, type DeliveryResult } from '@/lib/outbox'

// Meta Conversions API: the store's server reports each sale to Meta directly, alongside the
// browser pixel. Sales still count when the shopper's browser blocks the pixel (ad blockers,
// iPhone privacy settings), and Meta matches them to ad viewers better. The event id is the same
// `purchase-<order number>` the browser pixel sends, so Meta counts a sale once even when both
// arrive. Nothing is sent until a Pixel ID and an access token are saved in Settings › Tracking.
const GRAPH_VERSION = 'v23.0'
// Tests point this at a stand-in server; the live store always talks to Meta.
const graphBase = () => process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com'

export type AdClientContext = { ip?: string; userAgent?: string; fbp?: string; fbc?: string; sourceUrl?: string; sid?: string }

type PurchaseOrder = {
  orderNumber: string
  email: string
  phone?: string | null
  userId?: string | null
  grandTotal: number
  currency: string
  shippingAddressJson?: string | null
  items: Array<{ productId: string; quantity: number; unitPrice: number }>
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const hashed = (value: string | null | undefined) => { const v = String(value || '').trim().toLowerCase(); return v ? [sha256(v)] : undefined }

// The browser details Meta uses to match a server event to a person: their IP and browser, and
// the _fbp/_fbc cookies the pixel sets (fbc also comes from an ad click's ?fbclid).
export function adContextFromRequest(req: Request): AdClientContext {
  const headers = req.headers
  const cookies = Object.fromEntries((headers.get('cookie') || '').split(';').map(part => { const i = part.indexOf('='); return i > 0 ? [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())] : ['', ''] }).filter(([k]) => k))
  const referer = headers.get('referer') || ''
  let fbc = cookies._fbc || ''
  if (!fbc) { try { const id = new URL(referer).searchParams.get('fbclid'); if (id) fbc = `fb.1.${Date.now()}.${id}` } catch {} }
  return {
    ip: (headers.get('cf-connecting-ip') || headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined,
    userAgent: headers.get('user-agent') || undefined,
    fbp: cookies._fbp || undefined,
    fbc: fbc || undefined,
    sourceUrl: referer || undefined,
    // The store's own anonymous visitor id (no name, no address): lets Meta tie a visitor's events together.
    sid: /^[a-f0-9]{32}$/.test(cookies[SESSION_COOKIE] || '') ? cookies[SESSION_COOKIE] : undefined,
  }
}

export function buildMetaPurchaseEvent(order: PurchaseOrder, opts: { storeCountry?: string | null; storeUrl?: string; context?: AdClientContext; now?: number }) {
  let address: Record<string, unknown> = {}
  try { address = order.shippingAddressJson ? JSON.parse(order.shippingAddressJson) : {} } catch {}
  const phone = internationalPhone(order.phone || String(address.phone || ''), opts.storeCountry)
  const country = String(address.country || opts.storeCountry || '')
  const ctx = opts.context || {}
  // Who the sale belongs to: the account (or email) and, when known, the store's anonymous visitor id.
  const externalIds = [...new Set([...(order.userId ? [sha256(order.userId)] : hashed(order.email) ?? []), ...(ctx.sid ? [sha256(ctx.sid)] : [])])]
  const userData = Object.fromEntries(Object.entries({
    em: hashed(order.email),
    ph: phone ? [sha256(phone)] : undefined,
    fn: hashed(String(address.firstName || '')),
    ln: hashed(String(address.lastName || '')),
    ct: hashed(String(address.city || '').replace(/[^\p{L}]/gu, '')),
    country: isLebanon(country) ? [sha256('lb')] : undefined,
    external_id: externalIds.length ? externalIds : undefined,
    client_ip_address: ctx.ip,
    client_user_agent: ctx.userAgent,
    fbp: ctx.fbp,
    fbc: ctx.fbc,
  }).filter(([, v]) => v !== undefined && v !== ''))
  return {
    event_name: 'Purchase',
    event_time: Math.floor((opts.now ?? Date.now()) / 1000),
    event_id: `purchase-${order.orderNumber}`,
    action_source: 'website',
    event_source_url: ctx.sourceUrl || (opts.storeUrl ? `${opts.storeUrl}/order/success` : undefined),
    user_data: userData,
    custom_data: {
      currency: order.currency,
      value: Math.round(order.grandTotal) / 100,
      order_id: order.orderNumber,
      content_type: 'product',
      content_ids: order.items.map(i => String(i.productId)),
      contents: order.items.map(i => ({ id: String(i.productId), quantity: i.quantity, item_price: i.unitPrice / 100 })),
      num_items: order.items.reduce((sum, i) => sum + i.quantity, 0),
    },
  }
}

// Read at most once a minute: add-to-cart and checkout reports arrive often, and each must not wake the database.
let configCache: { at: number; value: Awaited<ReturnType<typeof loadMetaCapiConfig>> } | null = null
export async function metaCapiConfig() {
  if (configCache && Date.now() - configCache.at < 60_000) return configCache.value
  const value = await loadMetaCapiConfig()
  configCache = { at: Date.now(), value }
  return value
}

async function loadMetaCapiConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: ['tracking.metaPixelId', 'tracking.metaCapiToken', 'tracking.metaCapiTestCode', 'store.country'] } } })
  const map = new Map(rows.map(r => [r.key, r.value]))
  const pixelId = cleanTrackingIds({ metaPixelId: map.get('tracking.metaPixelId') || '' }).metaPixelId
  // A sealed token is opened here; a plain one saved before sealing still works (the daily job seals it).
  const storedToken = (map.get('tracking.metaCapiToken') || '').trim()
  const token = storedToken.startsWith('v1.') ? ((await openSecret(storedToken)) || '') : storedToken
  if (storedToken.startsWith('v1.') && !token) console.error('[meta-capi] the saved token cannot be read (the secret key changed); enter it again in Settings')
  return { pixelId, token, testCode: (map.get('tracking.metaCapiTestCode') || '').trim(), storeCountry: map.get('store.country') || 'Lebanon', enabled: !!(pixelId && token) }
}

// Meta's refusal, with what is needed to tell whether a later try can work (metaFailureIsPermanent).
export class MetaApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: number, readonly transient: boolean) {
    super(message)
    this.name = 'MetaApiError'
  }
}

export async function sendMetaEvents(events: unknown[], config: { pixelId: string; token: string; testCode?: string }, timeoutMs = 10000) {
  const res = await fetch(`${graphBase()}/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: events, ...(config.testCode ? { test_event_code: config.testCode } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await res.json().catch(() => ({})) as { events_received?: number; error?: { message?: string; code?: number; is_transient?: boolean } }
  if (!res.ok) throw new MetaApiError(body.error?.message || `Meta returned ${res.status}`, res.status, Number(body.error?.code) || 0, body.error?.is_transient === true)
  return body
}

// A sale report that failed is tried again by the hourly job (lib/outbox.ts) when a later try can work: no answer or a
// timeout, too many requests (429; codes 4, 17, 32, 341, 613), Meta's own error (5xx; codes 1, 2; or any answer Meta
// marks is_transient), and an expired or wrong access key (190) -- each try reads the key from Settings, so a sale
// made while the key was broken still reaches Meta once a new key is saved that day. Anything else Meta refuses (a
// malformed event, a wrong Pixel ID) would be refused again, so it is only logged. Retrying never counts a sale twice:
// Meta keeps one event per event id (purchase-<order number>), and the tries end within a day.
const RETRY_CODES = new Set([1, 2, 4, 17, 32, 190, 341, 613])
export function metaFailureIsPermanent(error: unknown) {
  if (!(error instanceof MetaApiError)) return false
  if (error.transient || RETRY_CODES.has(error.code)) return false
  return !(error.status === 429 || error.status >= 500)
}

// Reports one order as a Purchase. Safe to call for every order: it does nothing when the
// Conversions API isn't set up, and never throws (a reporting failure must not affect the sale).
// A failure a later try can fix is kept for the hourly retries with the event as built now (same
// event id and time); the access key is not kept with it.
export async function sendMetaPurchase(orderId: string, opts: { context?: AdClientContext; storeUrl?: string } = {}) {
  let queued: QueuedMetaEvents | null = null
  try {
    const config = await metaCapiConfig()
    if (!config.enabled) return
    const order = await db.order.findUnique({ where: { id: orderId }, select: { adConsent: true, orderNumber: true, email: true, phone: true, userId: true, grandTotal: true, currency: true, shippingAddressJson: true, items: { select: { productId: true, quantity: true, unitPrice: true } } } })
    // Only when the shopper accepted cookies at checkout, as the browser pixel does: Decline (or no answer) means
    // no ad tracking, from the browser or from here.
    if (!order || order.adConsent !== 'granted') return
    queued = { orderNumber: order.orderNumber, events: [buildMetaPurchaseEvent(order, { storeCountry: config.storeCountry, storeUrl: opts.storeUrl, context: opts.context })], testCode: config.testCode }
    await sendMetaEvents(queued.events, config)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[meta-capi] purchase not sent', orderId, message)
    if (queued && !metaFailureIsPermanent(error)) await queueRetry('meta', queued, message)
  }
}

type QueuedMetaEvents = { orderNumber: string; events: unknown[]; testCode?: string }

// The hourly job's try (lib/outbox.ts): the same events, to the Pixel ID and with the access key saved in Settings now.
export async function retryQueuedMeta(message: QueuedMetaEvents): Promise<DeliveryResult> {
  if (!Array.isArray(message?.events) || !message.events.length) return { ok: false, error: 'Nothing to send', permanent: true }
  const config = await metaCapiConfig()
  if (!config.enabled) return { ok: false, error: 'The Conversions API is no longer set up in Settings › Tracking', permanent: true }
  try {
    await sendMetaEvents(message.events, { ...config, testCode: message.testCode || '' })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), permanent: metaFailureIsPermanent(error) }
  }
}


// ---- Add to cart / checkout start, reported by the shopper's browser (/api/analytics/meta) ----

export const FUNNEL_EVENTS = ['AddToCart', 'InitiateCheckout'] as const
export type FunnelEvent = {
  name: (typeof FUNNEL_EVENTS)[number]
  eventId: string
  currency: string
  value: number
  url?: string
  items: Array<{ id: string; quantity: number; price: number }>
}

// What the browser sends is only trusted as far as is needed to report it: known event names, plain ids,
// sane numbers, a handful of items. Anything else is dropped.
export function readFunnelEvent(raw: unknown): FunnelEvent | null {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = FUNNEL_EVENTS.find(n => n === body.name)
  const eventId = typeof body.eventId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.eventId) ? body.eventId : ''
  const currency = typeof body.currency === 'string' && /^[A-Za-z]{3}$/.test(body.currency) ? body.currency.toUpperCase() : ''
  const value = Number(body.value)
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(item => {
    const i = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    return { id: typeof i.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(i.id) ? i.id : '', quantity: Math.floor(Number(i.quantity)), price: Number(i.price) }
  }).filter(i => i.id && Number.isFinite(i.quantity) && i.quantity >= 1 && i.quantity <= 1000 && Number.isFinite(i.price) && i.price >= 0 && i.price <= 1_000_000)
  if (!name || !eventId || !currency || !items.length || !Number.isFinite(value) || value < 0 || value > 10_000_000) return null
  return { name, eventId, currency, value: Math.round(value * 100) / 100, url: typeof body.url === 'string' ? body.url.slice(0, 500) : undefined, items }
}

export function buildMetaFunnelEvent(event: FunnelEvent, opts: { storeUrl?: string; context?: AdClientContext; userId?: string | null; now?: number }) {
  const ctx = opts.context || {}
  const externalIds = [...new Set([...(opts.userId ? [sha256(opts.userId)] : []), ...(ctx.sid ? [sha256(ctx.sid)] : [])])]
  // Only the store's own pages count as the source of the event.
  let sourceUrl = ctx.sourceUrl
  try { if (event.url && opts.storeUrl && new URL(event.url).origin === new URL(opts.storeUrl).origin) sourceUrl = event.url } catch {}
  const userData = Object.fromEntries(Object.entries({
    external_id: externalIds.length ? externalIds : undefined,
    client_ip_address: ctx.ip,
    client_user_agent: ctx.userAgent,
    fbp: ctx.fbp,
    fbc: ctx.fbc,
  }).filter(([, v]) => v !== undefined && v !== ''))
  return {
    event_name: event.name,
    event_time: Math.floor((opts.now ?? Date.now()) / 1000),
    event_id: event.eventId,
    action_source: 'website',
    event_source_url: sourceUrl || opts.storeUrl,
    user_data: userData,
    custom_data: {
      currency: event.currency,
      value: event.value,
      content_type: 'product',
      content_ids: event.items.map(i => i.id),
      contents: event.items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
      num_items: event.items.reduce((sum, i) => sum + i.quantity, 0),
    },
  }
}

// Forwards one reported event to Meta. Never throws: a reporting problem must not affect the shopper.
export async function sendMetaFunnelEvent(event: FunnelEvent, opts: { context?: AdClientContext; storeUrl?: string; userId?: string | null }) {
  try {
    const config = await metaCapiConfig()
    if (!config.enabled) return false
    await sendMetaEvents([buildMetaFunnelEvent(event, opts)], config, 5000)
    return true
  } catch (error) {
    console.error('[meta-capi] event not sent', event.name, error instanceof Error ? error.message : error)
    return false
  }
}
