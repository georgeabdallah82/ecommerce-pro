declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    gtag?: (...args: unknown[]) => void
    ttq?: { track: (event: string, data?: Record<string, unknown>) => void; page?: () => void }
  }
}

export type TrackedLineItem = {
  name: string
  sku: string
  price: number
  quantity: number
}

export function trackAddToCart(item: TrackedLineItem, currency: string) {
  if (typeof window === 'undefined') return
  const value = item.price * item.quantity
  try { window.fbq?.('track', 'AddToCart', { content_name: item.name, content_ids: [item.sku], content_type: 'product', currency, value }) } catch {}
  try { window.gtag?.('event', 'add_to_cart', { currency, value, items: [{ item_name: item.name, item_id: item.sku, quantity: item.quantity, price: item.price }] }) } catch {}
  try { window.ttq?.track('AddToCart', { content_id: item.sku, content_name: item.name, content_type: 'product', quantity: item.quantity, price: item.price, value, currency }) } catch {}
}

export function trackPurchase(order: { orderNumber: string; value: number; currency: string; items: TrackedLineItem[] }) {
  if (typeof window === 'undefined') return
  try {
    window.fbq?.('track', 'Purchase', {
      value: order.value,
      currency: order.currency,
      content_ids: order.items.map(i => i.sku),
      content_type: 'product',
      contents: order.items.map(i => ({ id: i.sku, quantity: i.quantity })),
    })
  } catch {}
  try {
    window.gtag?.('event', 'purchase', {
      transaction_id: order.orderNumber,
      value: order.value,
      currency: order.currency,
      items: order.items.map(i => ({ item_name: i.name, item_id: i.sku, quantity: i.quantity, price: i.price })),
    })
  } catch {}
  try {
    window.ttq?.track('CompletePayment', {
      value: order.value,
      currency: order.currency,
      contents: order.items.map(i => ({ content_id: i.sku, content_name: i.name, quantity: i.quantity, price: i.price })),
    })
  } catch {}
}
