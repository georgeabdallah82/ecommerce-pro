import { internationalPhone } from '@/lib/phone'

// Admin > Marketing > Win back: past customers who have not ordered for a while, to message on
// WhatsApp. Most customers order without an account, so a customer is a phone number: their
// orders are grouped by it (the same number however it was typed).

export const WINBACK_CODE_KEY = 'winback.code'
export const WINBACK_DAYS = [30, 60, 90, 180] as const
// Someone messaged from the list stays hidden this long, so nobody gets the same message twice in a row.
export const WINBACK_QUIET_DAYS = 30

export type WinbackOrder = { id: string; orderNumber: string; status: string; grandTotal: number; currency: string; createdAt: Date | string; phone: string | null; shippingAddressJson: string | null }
export type WinbackCustomer = { phone: string; name: string; delivered: number; spent: number; currency: string; lastOrderAt: string; lastOrderId: string; lastOrderNumber: string; daysSince: number }

const OPEN = new Set(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'])

function nameOf(json: string | null) {
  try {
    const a = JSON.parse(json || '{}') || {}
    return `${String(a.firstName || '').trim()} ${String(a.lastName || '').trim()}`.trim()
  } catch { return '' }
}

// Customers with at least one delivered order, nothing on the way, and no order for `days` days.
// Best customers (most spent) first.
export function winbackCustomers(orders: WinbackOrder[], options: { days: number; storeCountry: string; now?: Date; blocked?: Set<string> }): WinbackCustomer[] {
  const now = options.now ?? new Date()
  const groups = new Map<string, WinbackOrder[]>()
  for (const order of orders) {
    let phone = internationalPhone(order.phone, options.storeCountry)
    if (!phone) {
      try { phone = internationalPhone(String(JSON.parse(order.shippingAddressJson || '{}')?.phone || ''), options.storeCountry) } catch {}
    }
    if (!phone || options.blocked?.has(phone)) continue
    const list = groups.get(phone)
    if (list) list.push(order)
    else groups.set(phone, [order])
  }
  const cutoff = now.getTime() - options.days * 24 * 60 * 60 * 1000
  const out: WinbackCustomer[] = []
  for (const [phone, list] of groups) {
    if (list.some(o => OPEN.has(o.status))) continue
    const delivered = list.filter(o => o.status === 'DELIVERED')
    if (!delivered.length) continue
    const latest = list.filter(o => o.status !== 'CANCELLED').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    if (!latest || new Date(latest.createdAt).getTime() > cutoff) continue
    const named = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(o => nameOf(o.shippingAddressJson)).find(Boolean) || ''
    out.push({
      phone,
      name: named,
      delivered: delivered.length,
      spent: delivered.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0),
      currency: delivered[0].currency,
      lastOrderAt: new Date(latest.createdAt).toISOString(),
      lastOrderId: latest.id,
      lastOrderNumber: latest.orderNumber,
      daysSince: Math.floor((now.getTime() - new Date(latest.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
    })
  }
  return out.sort((a, b) => b.spent - a.spent || a.daysSince - b.daysSince)
}

// The WhatsApp message (English, like the other admin messages; staff can edit it in WhatsApp).
export function winbackMessage(input: { storeName: string; name: string; code: string; siteUrl: string }) {
  const first = input.name.split(/\s+/)[0] || ''
  return [
    `Hi${first ? ` ${first}` : ''}! It has been a while since your last order from ${input.storeName || 'our store'}. We have new things we think you will like.`,
    ...(input.code ? ['', `Use code ${input.code} at checkout for a little thank-you on your next order.`] : []),
    '',
    input.siteUrl,
  ].join('\n')
}

export const winbackDays = (raw: unknown) => {
  const n = Number(raw)
  return (WINBACK_DAYS as readonly number[]).includes(n) ? n : 60
}
