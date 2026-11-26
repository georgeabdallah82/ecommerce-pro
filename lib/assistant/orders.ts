import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { orderEmailMatches, orderPhoneMatches, orderViewToken } from '@/lib/order-access'
import { getStoreIdentity } from '@/lib/store-identity'

// "Where is my order?" in the chat, by the same rules as the store's own order lookup
// (app/api/orders/lookup): an order number alone never shows an order. It needs the signed-in
// customer who placed it, or the phone number or email the order was placed with. The same
// attempt limits apply (they share the lookup's counters), and the answer carries only the
// number, status, dates and a link to the order page: never the address, phone or email.

export type OrderTrackResult =
  | { ok: true; order: { orderNumber: string; status: string; placedAt: string; deliveredAt: string | null; itemCount: number; shippedEtaMinutes: number | null; link: string } }
  | { ok: false; reason: 'need_contact' | 'not_found' | 'too_many' | 'invalid' }

export async function trackOrder(input: { orderNumber?: unknown; contact?: unknown }, who: { userId: string | null; ip: string }): Promise<OrderTrackResult> {
  const orderNumber = typeof input.orderNumber === 'string' ? input.orderNumber.trim().replace(/^#\s*/, '').toUpperCase().slice(0, 60) : ''
  const contact = typeof input.contact === 'string' ? input.contact.trim().slice(0, 254) : ''
  if (!orderNumber || !/^[A-Z0-9-]{3,60}$/.test(orderNumber)) return { ok: false, reason: 'invalid' }

  const ipLimit = await consumeDurableRateLimit(`order-lookup:ip:${who.ip}`, 30, 15 * 60 * 1000)
  if (!ipLimit.allowed) return { ok: false, reason: 'too_many' }
  const orderLimit = await consumeDurableRateLimit(`order-lookup:order:${orderNumber}`, 10, 60 * 60 * 1000)
  if (!orderLimit.allowed) return { ok: false, reason: 'too_many' }

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { orderNumber: true, userId: true, email: true, phone: true, shippingAddressJson: true, status: true, createdAt: true, _count: { select: { items: true } }, id: true },
  })
  const owner = !!order && !!who.userId && order.userId === who.userId
  if (!owner) {
    // The same answer whether or not the number exists, so numbers can't be probed.
    if (!contact) return { ok: false, reason: 'need_contact' }
    const isEmail = contact.includes('@')
    const country = isEmail ? '' : (await getStoreIdentity().catch(() => ({ country: 'Lebanon' }))).country
    const matches = !!order && (isEmail ? orderEmailMatches(order.email, contact) : orderPhoneMatches(order, contact, country))
    if (!matches) return { ok: false, reason: 'not_found' }
  }
  if (!order) return { ok: false, reason: 'not_found' }
  const delivered = order.status === 'DELIVERED' ? await db.orderEvent.findFirst({ where: { orderId: order.id, status: 'DELIVERED' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }).catch(() => null) : null
  const tracking = order.status === 'SHIPPED' ? await db.deliveryTracking.findUnique({ where: { orderId: order.id }, select: { active: true, etaMinutes: true } }).catch(() => null) : null
  return {
    ok: true,
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      placedAt: order.createdAt.toISOString(),
      deliveredAt: delivered ? delivered.createdAt.toISOString() : null,
      itemCount: order._count.items,
      shippedEtaMinutes: tracking?.active && tracking.etaMinutes != null ? tracking.etaMinutes : null,
      link: `/account/orders/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(orderViewToken(order.orderNumber))}`,
    },
  }
}

// The signed-in customer's latest orders (for "track my order" without a number).
export async function recentOrdersOf(userId: string, limit = 3) {
  const rows = await db.order.findMany({ where: { userId }, select: { orderNumber: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: limit })
  return rows.map(r => ({ orderNumber: r.orderNumber, status: r.status, placedAt: r.createdAt.toISOString() }))
}
