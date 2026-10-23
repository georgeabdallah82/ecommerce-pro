import { collectsCashOnDelivery } from '@/lib/orders'
import { internationalPhone } from '@/lib/phone'
import { pinFromAddress, pinMapUrl } from '@/lib/location-pin'
import { slotFromAddress } from '@/lib/delivery-slots'

// The admin's words for an order's journey, and the one next step each order is waiting for.
// Used by the orders list and the order page so both say the same thing:
//   New (confirm with the customer) -> Confirmed (prepare it) -> Preparing (hand it to the
//   driver) -> Out for delivery (mark delivered once the customer has it) -> Delivered.
// The status codes stay as they are in the database; only what staff read changes.

export type FlowOrder = {
  orderNumber: string
  status: string
  paymentStatus: string
  paymentMethod?: string | null
  phone?: string | null
  email?: string | null
  grandTotal: number
  currency: string
  shippingAddressJson?: string | null
  shippingMethod?: string | null
  items?: Array<{ name: string; quantity: number; variant?: { name?: string | null } | null }>
  user?: { name?: string | null } | null
}

export const JOURNEY = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const

const STATUS: Record<string, { label: string; hint: string; tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'New', hint: 'Confirm it with the customer', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', hint: 'Prepare the parcel', tone: 'info' },
  PROCESSING: { label: 'Preparing', hint: 'Hand it to the driver when ready', tone: 'info' },
  SHIPPED: { label: 'Out for delivery', hint: 'Mark delivered when the customer has it', tone: 'info' },
  DELIVERED: { label: 'Delivered', hint: 'Done', tone: 'success' },
  CANCELLED: { label: 'Cancelled', hint: 'Nothing to do', tone: 'danger' },
  REFUNDED: { label: 'Refunded', hint: 'Nothing to do', tone: 'neutral' },
}
export const statusInfo = (status: string) => STATUS[status] || { label: status, hint: '', tone: 'neutral' as const }

const METHOD: Record<string, string> = { COD: 'Cash on delivery', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', WALLET: 'Store wallet' }
export const paymentMethodLabel = (method: string | null | undefined) => METHOD[String(method || '')] || String(method || '—')

// "Cash on delivery · collect $104.50" says what the driver must bring back; otherwise the state.
export function paymentInfo(order: Pick<FlowOrder, 'paymentMethod' | 'paymentStatus' | 'status'>): { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' } {
  const method = paymentMethodLabel(order.paymentMethod)
  if (order.paymentStatus === 'PAID') return { label: `${method} · paid`, tone: 'success' }
  if (order.paymentStatus === 'REFUNDED') return { label: `${method} · refunded`, tone: 'neutral' }
  if (order.paymentStatus === 'PARTIALLY_REFUNDED') return { label: `${method} · partly refunded`, tone: 'neutral' }
  if (order.paymentStatus === 'FAILED') return { label: `${method} · payment failed`, tone: 'danger' }
  if (order.status === 'CANCELLED') return { label: `${method} · not paid`, tone: 'neutral' }
  if (order.paymentMethod === 'COD') return { label: 'Cash on delivery · not collected yet', tone: 'warning' }
  return { label: `${method} · waiting for payment`, tone: 'warning' }
}

export type NextStep = { to: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED'; label: string; confirmTitle: string; confirmMessage: string }

// The single button that moves an order forward. Cancelling and refunding are never the next step.
export function nextStep(order: Pick<FlowOrder, 'status' | 'paymentMethod' | 'paymentStatus' | 'orderNumber' | 'grandTotal' | 'currency'>, formatMoney: (cents: number, currency: string) => string): NextStep | null {
  const n = `#${order.orderNumber}`
  switch (order.status) {
    case 'PENDING':
      return { to: 'CONFIRMED', label: 'Confirm order', confirmTitle: `Confirm ${n}?`, confirmMessage: 'Do this once the customer has said yes. The order moves to Confirmed, ready to prepare.' }
    case 'CONFIRMED':
      return { to: 'PROCESSING', label: 'Start preparing', confirmTitle: `Start preparing ${n}?`, confirmMessage: 'The order moves to Preparing while you pack it.' }
    case 'PROCESSING':
      return { to: 'SHIPPED', label: 'Send out for delivery', confirmTitle: `Send ${n} out for delivery?`, confirmMessage: 'The stock is taken out and the customer gets an email that the order is on its way.' }
    case 'SHIPPED': {
      const cod = collectsCashOnDelivery({ paymentMethod: String(order.paymentMethod || ''), paymentStatus: order.paymentStatus })
      return cod
        ? { to: 'DELIVERED', label: `Delivered · ${formatMoney(order.grandTotal, order.currency)} collected`, confirmTitle: `Mark ${n} as delivered?`, confirmMessage: `Only once the customer has the parcel and the driver collected ${formatMoney(order.grandTotal, order.currency)}. The order is then marked as paid.` }
        : { to: 'DELIVERED', label: 'Mark as delivered', confirmTitle: `Mark ${n} as delivered?`, confirmMessage: 'Only once the customer has the parcel.' }
    }
    default:
      return null
  }
}

// The list's quick views. "To prepare" covers Confirmed and Preparing: both still need packing.
export const ORDER_VIEWS = [
  { id: 'action', label: 'To confirm', statuses: ['PENDING'] },
  { id: 'prepare', label: 'To prepare', statuses: ['CONFIRMED', 'PROCESSING'] },
  { id: 'delivery', label: 'Out for delivery', statuses: ['SHIPPED'] },
  { id: 'done', label: 'Delivered', statuses: ['DELIVERED'] },
  { id: 'closed', label: 'Cancelled', statuses: ['CANCELLED', 'REFUNDED'] },
  { id: 'all', label: 'All', statuses: [] as string[] },
] as const
export type OrderViewId = typeof ORDER_VIEWS[number]['id']
export function viewCount(counts: Record<string, number>, view: { statuses: readonly string[] }) {
  const keys = view.statuses.length ? view.statuses : Object.keys(counts)
  return keys.reduce((sum, key) => sum + (counts[key] || 0), 0)
}

export function shippingAddress(raw: string | null | undefined): Record<string, string> {
  try { const value = raw ? JSON.parse(raw) : {}; return value && typeof value === 'object' ? value : {} } catch { return { line1: String(raw || '') } }
}

// Guests have no account name: the name they typed at checkout is in the delivery address.
export function customerName(order: Pick<FlowOrder, 'user' | 'shippingAddressJson' | 'email'>) {
  const a = shippingAddress(order.shippingAddressJson)
  return order.user?.name?.trim() || `${a.firstName || ''} ${a.lastName || ''}`.trim() || order.email || 'Customer'
}
export const customerPhone = (order: Pick<FlowOrder, 'phone' | 'shippingAddressJson'>) => String(order.phone || shippingAddress(order.shippingAddressJson).phone || '').trim()
export const customerCity = (order: Pick<FlowOrder, 'shippingAddressJson'>) => String(shippingAddress(order.shippingAddressJson).city || '').trim()

export function addressLines(order: Pick<FlowOrder, 'shippingAddressJson'>) {
  const a = shippingAddress(order.shippingAddressJson)
  return [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(', '), a.country].map(x => String(x || '').trim()).filter(Boolean)
}

export function itemsSummary(order: Pick<FlowOrder, 'items'>) {
  const items = order.items || []
  if (!items.length) return 'No items'
  const first = `${items[0].name} × ${items[0].quantity}`
  return items.length === 1 ? first : `${first} + ${items.length - 1} more`
}

// Call and map links for the customer's phone and delivery address.
export function telLink(order: Pick<FlowOrder, 'phone' | 'shippingAddressJson'>, storeCountry: string) {
  const digits = internationalPhone(customerPhone(order), storeCountry)
  return digits ? `tel:+${digits}` : ''
}
// The exact spot when the customer shared their location at checkout (lib/location-pin.ts),
// otherwise a search for the typed address.
// The delivery time the customer chose at checkout (lib/delivery-slots.ts), '' when they did not choose.
export const orderSlot = (order: Pick<FlowOrder, 'shippingAddressJson'>) => slotFromAddress(shippingAddress(order.shippingAddressJson))
export const orderPin = (order: Pick<FlowOrder, 'shippingAddressJson'>) => pinFromAddress(shippingAddress(order.shippingAddressJson))
export function mapsLink(order: Pick<FlowOrder, 'shippingAddressJson'>) {
  const pin = orderPin(order)
  if (pin) return pinMapUrl(pin)
  const lines = addressLines(order)
  return lines.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lines.join(', '))}` : ''
}

// "Exact location" when the customer shared their position, "Map" when it is only the typed address.
export const mapLabel = (order: Pick<FlowOrder, 'shippingAddressJson'>) => orderPin(order) ? 'Exact location' : 'Map'

// What to send the delivery driver (opened in WhatsApp, the driver is picked there): who, where,
// what, and how much cash to bring back.
export function driverMessage(order: FlowOrder, storeName: string, formatMoney: (cents: number, currency: string) => string) {
  const a = shippingAddress(order.shippingAddressJson)
  const cod = collectsCashOnDelivery({ paymentMethod: String(order.paymentMethod || ''), paymentStatus: order.paymentStatus })
  const items = (order.items || []).map(item => `• ${item.quantity} × ${item.name}${item.variant?.name && item.variant.name !== 'Default Title' ? ` (${item.variant.name})` : ''}`)
  return [
    `${storeName ? `${storeName} · ` : ''}Delivery #${order.orderNumber}`,
    `Customer: ${customerName(order)}`,
    ...(customerPhone(order) ? [`Phone: ${customerPhone(order)}`] : []),
    `Address: ${addressLines(order).join(', ') || '—'}`,
    ...(a.notes ? [`Note: ${String(a.notes).trim()}`] : []),
    ...items,
    cod ? `Collect: ${formatMoney(order.grandTotal, order.currency)} cash` : 'Already paid: collect nothing',
    ...(mapsLink(order) ? [`${mapLabel(order)}: ${mapsLink(order)}`] : []),
  ].join('\n')
}
export const driverShareLink = (order: FlowOrder, storeName: string, formatMoney: (cents: number, currency: string) => string) =>
  `https://wa.me/?text=${encodeURIComponent(driverMessage(order, storeName, formatMoney))}`
