import { db } from '@/lib/prisma'
import { internationalPhone } from '@/lib/phone'
import { customerPhone } from '@/lib/order-flow'

// "Risky order" warning: a new order from a phone number that refused a parcel or did not answer
// the driver before. Shown as a red line on the orders list and a banner on the order page, and
// added to the phone notification for a new order, so the owner calls before preparing anything.
// What counts (other orders with the same phone, never the order itself):
//   refused    cancelled after it was sent out, or the driver reported "customer refused"
//   missed     the driver reported "not answering" (and the order was not delivered in the end)
//   cancelled  cancelled before it was sent out
// An order that was delivered in the end never counts against the number.

export type RiskSignals = { refusals: number; missed: number; cancelled: number; delivered: number }
export type Risk = { level: 'high' | 'medium'; headline: string; reasons: string[]; context: string; signals: RiskSignals }

export type OtherOrder = { id: string; status: string; wasShipped: boolean; problems: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Counts from the other orders of the same phone number.
export function riskSignals(others: OtherOrder[]): RiskSignals {
  const s: RiskSignals = { refusals: 0, missed: 0, cancelled: 0, delivered: 0 }
  for (const o of others) {
    if (o.status === 'DELIVERED') { s.delivered += 1; continue }
    const reportedRefused = o.problems.includes('"reason":"refused"')
    const reportedMissed = o.problems.includes('"reason":"no-answer"')
    const cancelled = o.status === 'CANCELLED'
    if ((cancelled && o.wasShipped) || reportedRefused) s.refusals += 1
    else if (reportedMissed) s.missed += 1
    else if (cancelled) s.cancelled += 1
  }
  return s
}

export function assessRisk(s: RiskSignals): Risk | null {
  const high = s.refusals >= 1 || s.missed >= 2
  const medium = !high && (s.missed >= 1 || s.cancelled >= 2 || (s.cancelled >= 1 && s.delivered === 0))
  if (!high && !medium) return null
  const reasons = [
    s.refusals ? `Refused ${plural(s.refusals, 'earlier parcel')}` : '',
    s.missed ? `Did not answer the driver ${plural(s.missed, 'time')}` : '',
    s.cancelled ? `Cancelled ${plural(s.cancelled, 'earlier order')}` : '',
  ].filter(Boolean)
  return {
    level: high ? 'high' : 'medium',
    headline: high ? 'Call this customer before you prepare the order.' : 'Worth a quick call before you prepare the order.',
    reasons,
    context: s.delivered ? `${plural(s.delivered, 'earlier order')} delivered` : 'No earlier order delivered',
    signals: s,
  }
}

// Orders that can still be stopped: nothing has been sent out yet.
export const BEFORE_SENDING = new Set(['PENDING', 'CONFIRMED', 'PROCESSING'])

type Target = { id: string; status?: string; phone?: string | null; shippingAddressJson?: string | null }

// The warning for each given order (only those with a risk are in the map). One query for all of
// them: the other orders sharing a phone number's last 7 digits, each then checked exactly.
export async function riskForOrders(orders: Target[], storeCountry: string): Promise<Map<string, Risk>> {
  const targets = orders.flatMap(o => { const phone = internationalPhone(customerPhone({ phone: o.phone, shippingAddressJson: o.shippingAddressJson }), storeCountry); return phone ? [{ id: o.id, phone }] : [] })
  const result = new Map<string, Risk>()
  if (!targets.length) return result
  const tails = [...new Set(targets.map(t => t.phone.slice(-7)))]
  const rows = await db.$queryRaw<Array<{ id: string; phone: string | null; status: string; wasShipped: boolean; problems: string }>>`
    SELECT o."id", o."phone", o."status"::text AS "status",
      EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."status"::text = 'SHIPPED') AS "wasShipped",
      COALESCE((SELECT string_agg(a."metadataJson", ' ') FROM "AuditLog" a WHERE a."entity" = 'Order' AND a."entityId" = o."id" AND a."action" = 'order.driver_problem'), '') AS "problems"
    FROM "Order" o
    WHERE right(regexp_replace(coalesce(o."phone", ''), '[^0-9]', '', 'g'), 7) = ANY(${tails})
    LIMIT 3000`
  const byPhone = new Map<string, Array<{ id: string; status: string; wasShipped: boolean; problems: string }>>()
  for (const row of rows) {
    const phone = internationalPhone(row.phone, storeCountry)
    if (!phone) continue
    const list = byPhone.get(phone) || []
    list.push({ id: row.id, status: row.status, wasShipped: Boolean(row.wasShipped), problems: String(row.problems || '') })
    byPhone.set(phone, list)
  }
  for (const target of targets) {
    const risk = assessRisk(riskSignals((byPhone.get(target.phone) || []).filter(o => o.id !== target.id)))
    if (risk) result.set(target.id, risk)
  }
  return result
}

// The phone notification for a new order says so when its number has a history.
export async function riskNote(orderId: string, storeCountry: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, phone: true, shippingAddressJson: true } })
  if (!order) return ''
  const risk = (await riskForOrders([order], storeCountry)).get(order.id)
  return risk ? `${risk.level === 'high' ? 'RISKY number' : 'Check this number'}: ${risk.reasons.join(', ').toLowerCase()}. Call first.` : ''
}

// For the orders list: each order that can still be stopped gets `risk` (or null). The list must
// never fail because of this, so a problem here only means no warnings.
export async function withRisk<T extends Target & { status: string }>(rows: T[], storeCountry: string): Promise<Array<T & { risk: Risk | null }>> {
  try {
    const open = rows.filter(r => BEFORE_SENDING.has(r.status))
    const map = open.length ? await riskForOrders(open, storeCountry) : new Map<string, Risk>()
    return rows.map(r => ({ ...r, risk: map.get(r.id) || null }))
  } catch (error) {
    console.error('[orders] risk check failed', error)
    return rows.map(r => ({ ...r, risk: null }))
  }
}
