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

// wa.me link that opens a chat with the customer, message ready to send. Empty when the order
// has no usable phone number.
export function whatsappConfirmLink(order: ConfirmOrder, storeName: string, storeCountry: string | null | undefined, formatMoney: (cents: number, currency: string) => string) {
  const address = shippingAddress(order.shippingAddressJson)
  const phone = internationalPhone(order.phone || address.phone, storeCountry)
  if (!phone) return ''
  return `https://wa.me/${phone}?text=${encodeURIComponent(whatsappConfirmMessage(order, storeName, formatMoney))}`
}
