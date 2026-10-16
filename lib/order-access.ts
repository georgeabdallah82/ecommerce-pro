import { createHmac, timingSafeEqual } from 'node:crypto'
import { internationalPhone } from '@/lib/phone'

// Who may see an order's details (thank-you page, guest order page). An order number alone is
// never enough: they count up (1001, 1002, ...; older ones ORD-<timestamp>-<4 chars>), so they can
// be guessed. Access needs one of
//  - the signed-in customer who placed it,
//  - the email the order was placed with (what guest order lookup asks for), or
//  - the view code checkout and the card-payment return put in the thank-you link: an HMAC of the
//    order number with the server's secret, so only the server can make one.
function secret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return raw
}

export function orderViewToken(orderNumber: string) {
  return createHmac('sha256', secret()).update(`order-view:${orderNumber}`).digest('base64url').slice(0, 32)
}

export function isValidOrderViewToken(orderNumber: string, token: string | null | undefined) {
  if (!token || typeof token !== 'string') return false
  try {
    const expected = Buffer.from(orderViewToken(orderNumber))
    const given = Buffer.from(token)
    return expected.length === given.length && timingSafeEqual(expected, given)
  } catch { return false }
}

export function orderEmailMatches(orderEmail: string | null | undefined, email: string | null | undefined) {
  const a = String(orderEmail || '').trim().toLowerCase()
  const b = String(email || '').trim().toLowerCase()
  return !!a && a === b
}

// "Track your order" by phone (orders placed with a phone number only): the number typed matches
// the order's phone however either was written ("70 123 456", "+961 70123456", "0096170...").
export function orderPhoneMatches(order: { phone?: string | null; shippingAddressJson?: string | null }, typed: string | null | undefined, storeCountry?: string | null) {
  const given = internationalPhone(typed, storeCountry)
  if (!given) return false
  let addressPhone = ''
  try { addressPhone = String(JSON.parse(order.shippingAddressJson || '{}')?.phone || '') } catch {}
  return [order.phone, addressPhone].some(phone => !!phone && internationalPhone(phone, storeCountry) === given)
}

export function canViewOrder(
  order: { orderNumber: string; userId: string | null; email: string },
  access: { userId?: string | null; token?: string | null; email?: string | null },
) {
  if (access.userId && order.userId && access.userId === order.userId) return true
  if (isValidOrderViewToken(order.orderNumber, access.token)) return true
  return orderEmailMatches(order.email, access.email)
}

// The thank-you page address for an order, carrying its view code (no email in the address --
// it would end up in browser history and in the ad pixels' page-view reports).
export function orderSuccessPath(orderNumber: string, payment?: 'paid' | 'failed' | 'pending') {
  const params = new URLSearchParams({ order: orderNumber, t: orderViewToken(orderNumber) })
  if (payment) params.set('payment', payment)
  return `/order/success?${params.toString()}`
}

// The "rate your order" link sent after delivery (app/review/[orderNumber]): its own code, so the
// link lets the customer review what they bought without also opening the order's address and
// phone the way the view code does.
export function orderReviewToken(orderNumber: string) {
  return createHmac('sha256', secret()).update(`order-review:${orderNumber}`).digest('base64url').slice(0, 24)
}

export function isValidOrderReviewToken(orderNumber: string, token: string | null | undefined) {
  if (!token || typeof token !== 'string') return false
  try {
    const expected = Buffer.from(orderReviewToken(orderNumber))
    const given = Buffer.from(token)
    return expected.length === given.length && timingSafeEqual(expected, given)
  } catch { return false }
}

export function orderReviewPath(orderNumber: string) {
  return `/review/${encodeURIComponent(orderNumber)}?t=${orderReviewToken(orderNumber)}`
}
