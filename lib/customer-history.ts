import { db } from '@/lib/prisma'
import { internationalPhone } from '@/lib/phone'

// "Customer history" on an order (Admin > Orders > order): the other orders placed with the same
// phone number -- most customers order without an account, so the phone is what ties their
// orders together. Shows staff a returning customer, or one who cancelled before (for cash on
// delivery: an order cancelled after it was sent out is usually a refused delivery).

export type HistoryOrder = { id: string; orderNumber: string; status: string; grandTotal: number; currency: string; createdAt: string; refused?: boolean }
export type PhoneHistory = { total: number; delivered: number; cancelled: number; refused: number; open: number; orders: HistoryOrder[]; warning: string }

const OPEN = new Set(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'])

export function summarizePhoneHistory(orders: HistoryOrder[]): PhoneHistory {
  const delivered = orders.filter(o => o.status === 'DELIVERED').length
  const cancelled = orders.filter(o => o.status === 'CANCELLED').length
  const refused = orders.filter(o => o.status === 'CANCELLED' && o.refused).length
  const open = orders.filter(o => OPEN.has(o.status)).length
  const warning = refused
    ? `Careful: ${refused} earlier order${refused === 1 ? ' was' : 's were'} cancelled after being sent out (likely refused at the door).`
    : cancelled >= 2 || (cancelled >= 1 && delivered === 0)
      ? `Careful: this phone number cancelled ${cancelled} earlier order${cancelled === 1 ? '' : 's'}${delivered ? '' : ' and has no delivered order yet'}.`
      : ''
  return { total: orders.length, delivered, cancelled, refused, open, orders, warning }
}

// The comparison key in SQL: the number's last 7 digits (the same for "70 123 456",
// "+961 70123456" and "0096170123456"); each match is then checked exactly.
export async function phoneHistory(orderId: string, phone: string | null | undefined, storeCountry: string): Promise<PhoneHistory | null> {
  const target = internationalPhone(phone, storeCountry)
  if (!target) return null
  const tail = target.slice(-7)
  const rows = await db.$queryRaw<Array<{ id: string; orderNumber: string; status: string; grandTotal: number; currency: string; createdAt: Date; phone: string | null }>>`
    SELECT "id", "orderNumber", "status"::text AS "status", "grandTotal", "currency", "createdAt", "phone"
    FROM "Order"
    WHERE "id" <> ${orderId} AND regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') LIKE ${`%${tail}`}
    ORDER BY "createdAt" DESC
    LIMIT 100`
  const same = rows.filter(row => internationalPhone(row.phone, storeCountry) === target)
  const cancelledIds = same.filter(row => row.status === 'CANCELLED').map(row => row.id)
  const sentOut = cancelledIds.length
    ? new Set((await db.orderEvent.findMany({ where: { orderId: { in: cancelledIds }, status: 'SHIPPED' }, select: { orderId: true } })).map(e => e.orderId))
    : new Set<string>()
  return summarizePhoneHistory(same.map(row => ({
    id: row.id, orderNumber: row.orderNumber, status: row.status, grandTotal: Number(row.grandTotal), currency: row.currency,
    createdAt: new Date(row.createdAt).toISOString(), refused: sentOut.has(row.id),
  })))
}

// "First order only" codes (the welcome-popup code) for customers without an account: has this
// phone number or email ordered before (cancelled orders don't count)?
export async function orderedBefore(phone: string | null | undefined, email: string | null | undefined, storeCountry: string) {
  const e = String(email || '').trim().toLowerCase()
  if (e && await db.order.findFirst({ where: { email: { equals: e, mode: 'insensitive' }, status: { not: 'CANCELLED' } }, select: { id: true } })) return true
  const target = internationalPhone(phone, storeCountry)
  if (!target) return false
  const rows = await db.$queryRaw<Array<{ phone: string | null }>>`
    SELECT "phone" FROM "Order"
    WHERE "status"::text <> 'CANCELLED' AND regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') LIKE ${`%${target.slice(-7)}`}
    LIMIT 50`
  return rows.some(row => internationalPhone(row.phone, storeCountry) === target)
}

// A "once per customer" discount code (Admin > Discounts): has this customer -- their account, email or phone
// number -- an order with this code that wasn't cancelled? A cancelled order gives the use back, as it gives back
// the code's count. Matching by phone and email as well stops a second order without an account using it again.
export async function usedCodeBefore(code: string, customer: { userId?: string | null; phone?: string | null; email?: string | null }, storeCountry: string) {
  const used = { couponCode: { equals: code, mode: 'insensitive' as const }, status: { not: 'CANCELLED' as const } }
  if (customer.userId && await db.order.findFirst({ where: { ...used, userId: customer.userId }, select: { id: true } })) return true
  const e = String(customer.email || '').trim().toLowerCase()
  if (e && await db.order.findFirst({ where: { ...used, email: { equals: e, mode: 'insensitive' } }, select: { id: true } })) return true
  const target = internationalPhone(customer.phone, storeCountry)
  if (!target) return false
  const rows = await db.$queryRaw<Array<{ phone: string | null }>>`
    SELECT "phone" FROM "Order"
    WHERE "status"::text <> 'CANCELLED' AND lower("couponCode") = lower(${code}) AND regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') LIKE ${`%${target.slice(-7)}`}
    LIMIT 50`
  return rows.some(row => internationalPhone(row.phone, storeCountry) === target)
}
