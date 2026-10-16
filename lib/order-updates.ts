import { collectsCashOnDelivery } from '@/lib/orders'
import { internationalPhone } from '@/lib/phone'
import { customerPhone, shippingAddress, type FlowOrder } from '@/lib/order-flow'

// One-tap WhatsApp updates staff send a customer from the order page (Admin > Orders > order):
// "confirmed" once the order is confirmed or being prepared, "on the way" once it is out for
// delivery. Most customers order with a phone number only, so this is how they hear about
// their order. Each carries the link to follow the order (its view code, no sign-in needed).
export type CustomerUpdate = 'confirmed' | 'on_the_way'

type Money = (cents: number, currency: string) => string

export function updateForStatus(status: string): CustomerUpdate | null {
  if (status === 'CONFIRMED' || status === 'PROCESSING') return 'confirmed'
  if (status === 'SHIPPED') return 'on_the_way'
  return null
}

export function customerUpdateMessage(kind: CustomerUpdate, order: FlowOrder, storeName: string, money: Money, trackLink: string) {
  const a = shippingAddress(order.shippingAddressJson)
  const firstName = String(a.firstName || order.user?.name || '').trim().split(/\s+/)[0] || ''
  const hi = `Hi${firstName ? ` ${firstName}` : ''}`
  const total = money(order.grandTotal, order.currency)
  const cod = collectsCashOnDelivery({ paymentMethod: String(order.paymentMethod || ''), paymentStatus: order.paymentStatus })
  const follow = trackLink ? [`Follow your order: ${trackLink}`] : []
  if (kind === 'confirmed') {
    return [
      `${hi}, your order #${order.orderNumber} from ${storeName || 'our store'} is confirmed. We are preparing it now.`,
      `Total: ${total}${cod ? ' (cash on delivery)' : order.paymentStatus === 'PAID' ? ' (paid)' : ''}`,
      ...follow,
      'Thank you!',
    ].join('\n')
  }
  const phone = customerPhone(order)
  return [
    `${hi}, your order #${order.orderNumber} is on its way!${phone ? ` The driver will call you on ${phone}.` : ''}`,
    cod ? `Please have ${total} ready in cash.` : order.paymentStatus === 'PAID' ? 'It is already paid: nothing to pay on delivery.' : `Amount due: ${total}.`,
    ...follow,
    'Thank you!',
  ].join('\n')
}

export function customerUpdateLink(kind: CustomerUpdate, order: FlowOrder, storeName: string, storeCountry: string, money: Money, trackLink: string) {
  const digits = internationalPhone(customerPhone(order), storeCountry)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(customerUpdateMessage(kind, order, storeName, money, trackLink))}` : ''
}
