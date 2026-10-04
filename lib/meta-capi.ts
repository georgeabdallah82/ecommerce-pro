import { createHash } from 'node:crypto'
import { db } from '@/lib/prisma'
import { cleanTrackingIds } from '@/lib/tracking'
import { internationalPhone, isLebanon } from '@/lib/phone'

// Meta Conversions API: the store's server reports each sale to Meta directly, alongside the
// browser pixel. Sales still count when the shopper's browser blocks the pixel (ad blockers,
// iPhone privacy settings), and Meta matches them to ad viewers better. The event id is the same
// `purchase-<order number>` the browser pixel sends, so Meta counts a sale once even when both
// arrive. Nothing is sent until a Pixel ID and an access token are saved in Settings › Tracking.
const GRAPH_VERSION = 'v23.0'

export type AdClientContext = { ip?: string; userAgent?: string; fbp?: string; fbc?: string; sourceUrl?: string }

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
  }
}

export function buildMetaPurchaseEvent(order: PurchaseOrder, opts: { storeCountry?: string | null; storeUrl?: string; context?: AdClientContext; now?: number }) {
  let address: Record<string, unknown> = {}
  try { address = order.shippingAddressJson ? JSON.parse(order.shippingAddressJson) : {} } catch {}
  const phone = internationalPhone(order.phone || String(address.phone || ''), opts.storeCountry)
  const country = String(address.country || opts.storeCountry || '')
  const ctx = opts.context || {}
  const userData = Object.fromEntries(Object.entries({
    em: hashed(order.email),
    ph: phone ? [sha256(phone)] : undefined,
    fn: hashed(String(address.firstName || '')),
    ln: hashed(String(address.lastName || '')),
    ct: hashed(String(address.city || '').replace(/[^\p{L}]/gu, '')),
    country: isLebanon(country) ? [sha256('lb')] : undefined,
    external_id: order.userId ? [sha256(order.userId)] : hashed(order.email),
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

export async function metaCapiConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: ['tracking.metaPixelId', 'tracking.metaCapiToken', 'tracking.metaCapiTestCode', 'store.country'] } } })
  const map = new Map(rows.map(r => [r.key, r.value]))
  const pixelId = cleanTrackingIds({ metaPixelId: map.get('tracking.metaPixelId') || '' }).metaPixelId
  const token = (map.get('tracking.metaCapiToken') || '').trim()
  return { pixelId, token, testCode: (map.get('tracking.metaCapiTestCode') || '').trim(), storeCountry: map.get('store.country') || 'Lebanon', enabled: !!(pixelId && token) }
}

export async function sendMetaEvents(events: unknown[], config: { pixelId: string; token: string; testCode?: string }) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: events, ...(config.testCode ? { test_event_code: config.testCode } : {}) }),
    signal: AbortSignal.timeout(10000),
  })
  const body = await res.json().catch(() => ({})) as { events_received?: number; error?: { message?: string } }
  if (!res.ok) throw new Error(body.error?.message || `Meta returned ${res.status}`)
  return body
}

// Reports one order as a Purchase. Safe to call for every order: it does nothing when the
// Conversions API isn't set up, and never throws (a reporting failure must not affect the sale).
export async function sendMetaPurchase(orderId: string, opts: { context?: AdClientContext; storeUrl?: string } = {}) {
  try {
    const config = await metaCapiConfig()
    if (!config.enabled) return
    const order = await db.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, email: true, phone: true, userId: true, grandTotal: true, currency: true, shippingAddressJson: true, items: { select: { productId: true, quantity: true, unitPrice: true } } } })
    if (!order) return
    await sendMetaEvents([buildMetaPurchaseEvent(order, { storeCountry: config.storeCountry, storeUrl: opts.storeUrl, context: opts.context })], config)
  } catch (error) {
    console.error('[meta-capi] purchase not sent', orderId, error instanceof Error ? error.message : error)
  }
}
