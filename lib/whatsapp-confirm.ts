import { internationalPhone } from '@/lib/phone'

type ConfirmOrder = {
  orderNumber: string
  phone?: string | null
  email?: string | null
  grandTotal: number
  currency: string
  paymentMethod?: string | null
  shippingAddressJson?: string | null
  items?: Array<{ name: string; quantity: number; variant?: { name?: string | null } | null }>
  user?: { name?: string | null } | null
}

function shippingAddress(raw: string | null | undefined) {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

const PAYMENT_LABEL: Record<string, string> = { COD: 'cash on delivery', CARD: 'paid by card', BANK_TRANSFER: 'bank transfer', WALLET: 'store wallet' }

// The message the store sends a customer to confirm their order before shipping it -- mostly for
// cash-on-delivery orders, so a fake or forgotten order is caught before a wasted delivery.
export function whatsappConfirmMessage(order: ConfirmOrder, storeName: string, formatMoney: (cents: number, currency: string) => string) {
  const address = shippingAddress(order.shippingAddressJson)
  const firstName = String(address.firstName || order.user?.name || '').trim().split(/\s+/)[0] || ''
  const items = (order.items || []).map(item => `• ${item.quantity} × ${item.name}${item.variant?.name && item.variant.name !== 'Default Title' ? ` (${item.variant.name})` : ''}`)
  const where = [address.line1, address.city].map((x: unknown) => String(x || '').trim()).filter(Boolean).join(', ')
  const payment = PAYMENT_LABEL[String(order.paymentMethod || '')] || ''
  return [
    `Hi${firstName ? ` ${firstName}` : ''}, this is ${storeName || 'our store'}. We received your order #${order.orderNumber}:`,
    ...items,
    `Total: ${formatMoney(order.grandTotal, order.currency)}${payment ? ` (${payment})` : ''}`,
    ...(where ? [`Delivery to: ${where}`] : []),
    '',
    'Can you please confirm the order? Reply YES and we will send it out. Thank you!',
  ].join('\n')
}

// Why there is no WhatsApp button on an order: no number at all, or one too short, too long or
// mistyped to open a chat. Empty when the number is usable.
export function whatsappPhoneProblem(order: Pick<ConfirmOrder, 'phone' | 'shippingAddressJson'>, storeCountry: string | null | undefined) {
  const typed = String(order.phone || shippingAddress(order.shippingAddressJson).phone || '').trim()
  if (!typed) return 'No phone number on this order, so it can\'t be confirmed on WhatsApp. Call or email the customer instead.'
  if (!internationalPhone(typed, storeCountry)) return `The phone number "${typed.slice(0, 40)}" looks incomplete or mistyped, so WhatsApp can't open it. Fix it with Edit order, or call the customer.`
  return ''
}

// What the customer answered, recorded on the order by staff after the WhatsApp chat. Opening the
// chat proves nothing (the message may never have been sent or answered), so the order is only
// ever confirmed, changed or cancelled by staff themselves; these are notes for the timeline.
export const WHATSAPP_OUTCOMES = {
  confirmed: 'Customer confirmed the order on WhatsApp',
  no_answer: 'Messaged on WhatsApp, no answer yet',
  change_requested: 'Customer asked for a change on WhatsApp',
  cancel_requested: 'Customer asked on WhatsApp to cancel',
  wrong_number: 'WhatsApp number is wrong or not on WhatsApp',
} as const
export type WhatsappOutcome = keyof typeof WHATSAPP_OUTCOMES

export function whatsappOutcomeNote(outcome: string, detail?: string | null) {
  if (!Object.prototype.hasOwnProperty.call(WHATSAPP_OUTCOMES, outcome)) return ''
  const extra = String(detail || '').trim().slice(0, 500)
  return `${WHATSAPP_OUTCOMES[outcome as WhatsappOutcome]}.${extra ? ` ${extra}` : ''}`
}

// wa.me link that opens a chat with the customer, message ready to send. Empty when the order
// has no usable phone number.
export function whatsappConfirmLink(order: ConfirmOrder, storeName: string, storeCountry: string | null | undefined, formatMoney: (cents: number, currency: string) => string) {
  const address = shippingAddress(order.shippingAddressJson)
  const phone = internationalPhone(order.phone || address.phone, storeCountry)
  if (!phone) return ''
  return `https://wa.me/${phone}?text=${encodeURIComponent(whatsappConfirmMessage(order, storeName, formatMoney))}`
}
