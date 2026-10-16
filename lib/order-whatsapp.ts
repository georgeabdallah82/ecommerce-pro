// The message a customer sends the store on WhatsApp right after ordering (thank-you page,
// "Send my order on WhatsApp"): it tells the store the order is real and puts the customer in
// the store's chats, which makes the confirmation call quicker. Texts go through the page's
// translator, so an Arabic shopper sends it in Arabic.
type Translate = (text: string, vars?: Record<string, string | number>) => string

export type CustomerOrderMessage = {
  storeName: string
  orderNumber: string
  items: Array<{ name: string; quantity: number }>
  total: string
  paymentLabel: string
  name: string
  place: string
}

export function customerOrderMessage(order: CustomerOrderMessage, t: Translate) {
  const lines = [
    t('Hello {store}! I just placed order #{number}.', { store: order.storeName || t('there'), number: order.orderNumber }),
    '',
    ...order.items.slice(0, 15).map(item => `• ${item.quantity} × ${item.name}`),
    ...(order.items.length > 15 ? [t('+ {count} more', { count: order.items.length - 15 })] : []),
    '',
    t('Total: {amount} ({payment})', { amount: order.total, payment: order.paymentLabel }),
    ...(order.name ? [t('Name: {name}', { name: order.name })] : []),
    ...(order.place ? [t('Delivery to: {place}', { place: order.place })] : []),
  ]
  return lines.join('\n')
}

export function whatsappMessageLink(digits: string, message: string) {
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : ''
}
