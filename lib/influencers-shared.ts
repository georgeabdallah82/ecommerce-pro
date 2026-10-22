// Influencer codes (Admin > Marketing > Influencers): the rules that do not need the database, so the
// page, the API and the tests all use the same ones. Money is in cents like everywhere else.

export const MIN_CODE_LENGTH = 3
export const MAX_CODE_LENGTH = 20
export const MAX_CUSTOMER_PERCENT = 50
export const MAX_COMMISSION_PERCENT = 50

// A code is letters and numbers only, in capitals (that is how discount codes are stored).
export const cleanInfluencerCode = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_CODE_LENGTH)

// "Maya Haddad", 10 -> MAYA10. Arabic and other letters are dropped, so the owner types one.
export function suggestInfluencerCode(name: unknown, customerPercent: number) {
  const first = cleanInfluencerCode(String(name ?? '').trim().split(/\s+/)[0] || '').slice(0, 12)
  if (first.length < 2) return ''
  return cleanInfluencerCode(`${first}${Number.isFinite(customerPercent) && customerPercent > 0 ? Math.round(customerPercent) : ''}`)
}

export type InfluencerInput = {
  name: string
  handle: string
  phone: string
  code: string
  customerPercent: number
  commissionPercent: number
  notes: string
}

const wholePercent = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value)
  return Number.isFinite(n) && Number.isInteger(n) ? n : NaN
}

// What the owner typed, checked and tidied. `error` is a plain sentence for the owner.
export function validateInfluencer(raw: unknown, { requireCode = true }: { requireCode?: boolean } = {}): { ok: true; value: InfluencerInput } | { ok: false; error: string } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'Write the influencer\'s name.' }
  if (name.length > 80) return { ok: false, error: 'The name is too long.' }
  const customerPercent = wholePercent(body.customerPercent)
  if (!(customerPercent >= 1 && customerPercent <= MAX_CUSTOMER_PERCENT)) return { ok: false, error: `The customer discount must be a whole number from 1 to ${MAX_CUSTOMER_PERCENT}.` }
  const commissionPercent = wholePercent(body.commissionPercent)
  if (!(commissionPercent >= 0 && commissionPercent <= MAX_COMMISSION_PERCENT)) return { ok: false, error: `The commission must be a whole number from 0 to ${MAX_COMMISSION_PERCENT}.` }
  const code = cleanInfluencerCode(body.code)
  if (requireCode && (code.length < MIN_CODE_LENGTH)) return { ok: false, error: `The code needs ${MIN_CODE_LENGTH} to ${MAX_CODE_LENGTH} letters or numbers, like MAYA10.` }
  const handle = String(body.handle ?? '').trim().slice(0, 60)
  const phoneText = String(body.phone ?? '').trim().slice(0, 30)
  if (phoneText && phoneText.replace(/\D/g, '').length < 6) return { ok: false, error: 'That WhatsApp number looks incomplete.' }
  const notes = String(body.notes ?? '').trim().slice(0, 500)
  return { ok: true, value: { name, handle, phone: phoneText, code, customerPercent, commissionPercent, notes } }
}

export type OrderForCommission = {
  status: string
  subtotal: number
  discountTotal: number
  grandTotal: number
  // What was given back to the customer (refund payments on the order).
  refunded: number
}

// Orders that are still on their way: they count as "waiting", not yet as earned.
const ON_ITS_WAY = new Set(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'])

// The part of an order the influencer earns on: what the customer paid for the goods (after the
// code's discount, without delivery or tax), less the share that was refunded.
export function orderValue(order: Pick<OrderForCommission, 'subtotal' | 'discountTotal' | 'grandTotal' | 'refunded'>) {
  const goods = Math.max(0, order.subtotal - order.discountTotal)
  if (!(order.grandTotal > 0)) return goods
  const refundedShare = Math.min(1, Math.max(0, order.refunded) / order.grandTotal)
  return Math.round(goods * (1 - refundedShare))
}

export const commissionFor = (value: number, percent: number) => Math.round(Math.max(0, value) * Math.max(0, percent) / 100)

export type InfluencerStats = {
  orders: number          // orders made with the code, not cancelled or refunded
  delivered: number       // of those, delivered
  sales: number           // value of the delivered orders
  waitingSales: number    // value of the orders still on their way
  earned: number          // commission on the delivered orders
  waiting: number         // commission on the orders still on their way (earned once delivered)
  paid: number            // paid to the influencer so far
  owed: number            // earned - paid, never below zero
  overpaid: number        // paid more than earned (shown as a warning)
}

export function summarizeInfluencer(orders: OrderForCommission[], commissionPercent: number, paid: number): InfluencerStats {
  let count = 0, delivered = 0, sales = 0, waitingSales = 0
  for (const order of orders) {
    if (order.status === 'DELIVERED') { count++; delivered++; sales += orderValue(order) }
    else if (ON_ITS_WAY.has(order.status)) { count++; waitingSales += orderValue(order) }
  }
  const earned = commissionFor(sales, commissionPercent)
  const waiting = commissionFor(waitingSales, commissionPercent)
  const settled = Math.max(0, Math.round(paid))
  return { orders: count, delivered, sales, waitingSales, earned, waiting, paid: settled, owed: Math.max(0, earned - settled), overpaid: Math.max(0, settled - earned) }
}

// The payment the owner records, in cents. Checked on the server too.
export function validatePayout(raw: unknown): { ok: true; amount: number; note: string } | { ok: false; error: string } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const amount = body.amount
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'Write the amount you paid.' }
  if (amount > 100_000_000) return { ok: false, error: 'That amount is too large.' }
  return { ok: true, amount, note: String(body.note ?? '').trim().slice(0, 200) }
}

// The WhatsApp message that gives the influencer their code.
export function influencerMessage({ storeName, name, code, customerPercent, commissionPercent, siteUrl }: { storeName: string; name: string; code: string; customerPercent: number; commissionPercent: number; siteUrl: string }) {
  const first = String(name || '').trim().split(/\s+/)[0] || ''
  const store = storeName || 'our store'
  return [
    `Hi${first ? ` ${first}` : ''}! Your code at ${store} is ${code}.`,
    `Your followers get ${customerPercent}% off when they use it at checkout${siteUrl ? `: ${siteUrl}` : '.'}`,
    commissionPercent > 0 ? `You earn ${commissionPercent}% on every order that is delivered. We will send you the details and your payment regularly.` : '',
  ].filter(Boolean).join('\n')
}
