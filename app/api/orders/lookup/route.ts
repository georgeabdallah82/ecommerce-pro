import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { orderEmailMatches, orderPhoneMatches, orderViewToken } from '@/lib/order-access'
import { getStoreIdentity } from '@/lib/store-identity'

const NO_STORE = { 'Cache-Control': 'no-store' }

// "Track your order": the order number plus the phone number or the email it was placed with.
// The answer carries the order's view code, so the order page opens without the phone or email
// in the address bar.
export async function POST(request: Request) {
  const ip = clientIp(request.headers)
  const limit = await consumeDurableRateLimit(`order-lookup:ip:${ip}`, 30, 15 * 60 * 1000)
  if (!limit.allowed) {
    return json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), ...NO_STORE } })
  }

  const body = await request.json().catch(() => null)
  // People type the number as printed ("#1001", "ord-…"): drop the # and match the stored case.
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim().replace(/^#\s*/, '').toUpperCase().slice(0, 60) : ''
  const contact = String(typeof body?.contact === 'string' ? body.contact : typeof body?.email === 'string' ? body.email : '').trim().slice(0, 254)
  const isEmail = contact.includes('@')
  if (!orderNumber || !contact || (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : contact.replace(/\D/g, '').length < 7)) {
    return json({ error: 'Please enter your order number and your phone number or email.' }, { status: 400, headers: NO_STORE })
  }
  // Order numbers count up, so each one also gets its own small allowance: trying many phone
  // numbers against one order from many addresses stops quickly.
  const perOrder = await consumeDurableRateLimit(`order-lookup:order:${orderNumber}`, 10, 60 * 60 * 1000)
  if (!perOrder.allowed) {
    return json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(perOrder.retryAfterSeconds), ...NO_STORE } })
  }

  const order = await db.order.findUnique({ where: { orderNumber }, select: { orderNumber: true, email: true, phone: true, shippingAddressJson: true } })
  const country = isEmail ? '' : (await getStoreIdentity().catch(() => ({ country: 'Lebanon' }))).country
  const matches = !!order && (isEmail ? orderEmailMatches(order.email, contact) : orderPhoneMatches(order, contact, country))
  if (!order || !matches) {
    return json({ error: 'We could not find an order with that number and phone number or email.' }, { status: 404, headers: NO_STORE })
  }

  return json({ ok: true, orderNumber: order.orderNumber, token: orderViewToken(order.orderNumber) }, { headers: NO_STORE })
}
