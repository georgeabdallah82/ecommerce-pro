declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    gtag?: (...args: unknown[]) => void
    ttq?: { track: (event: string, data?: Record<string, unknown>, options?: Record<string, unknown>) => void; page?: () => void; identify?: (data: Record<string, unknown>) => void }
    __metaPixelId?: string
    // Google Ads purchase conversion ('AW-id/label'), set when the store has one (components/tracking-scripts.tsx).
    __googleAdsSendTo?: string
  }
}

// Ad-pixel events (Meta, Google Analytics 4, TikTok). Every event names products by the same
// id -- the product's id -- so Meta and TikTok can tie a view, an add-to-cart and a purchase to
// the same product (retargeting audiences, catalog ads, optimisation). Prices are in the store
// currency's main unit (12.5 = $12.50).
export type TrackedLineItem = {
  id: string
  name: string
  price: number
  quantity: number
}

const safely = (fn: () => void) => { try { fn() } catch {} }

// Each add-to-cart / checkout start gets an id. The Meta pixel sends it with the event, and the same
// event is also reported to our own server (/api/analytics/meta), which forwards it to Meta with the
// same id -- so Meta counts it once, and still hears about it when the browser blocks the pixel.
const newEventId = (name: string) => `${name.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
function reportToServer(name: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout', eventId: string, items: TrackedLineItem[], total: number, currency: string) {
  if (!window.__metaPixelId) return
  safely(() => {
    fetch('/api/analytics/meta', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ name, eventId, currency, value: total, url: location.href, items: items.map(i => ({ id: i.id, quantity: i.quantity, price: i.price })) }),
    }).catch(() => {})
  })
}
const value = (items: TrackedLineItem[]) => Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100

export function trackViewContent(item: Omit<TrackedLineItem, 'quantity'>, currency: string) {
  if (typeof window === 'undefined') return
  const eventID = newEventId('ViewContent')
  safely(() => window.fbq?.('track', 'ViewContent', { content_ids: [item.id], content_name: item.name, content_type: 'product', value: item.price, currency }, { eventID }))
  reportToServer('ViewContent', eventID, [{ ...item, quantity: 1 }], item.price, currency)
  safely(() => window.gtag?.('event', 'view_item', { currency, value: item.price, items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: 1 }] }))
  safely(() => window.ttq?.track('ViewContent', { contents: [{ content_id: item.id, content_name: item.name, price: item.price, quantity: 1 }], content_type: 'product', value: item.price, currency }))
}

export function trackAddToCart(item: TrackedLineItem, currency: string) {
  if (typeof window === 'undefined') return
  const total = value([item])
  const eventID = newEventId('AddToCart')
  safely(() => window.fbq?.('track', 'AddToCart', { content_ids: [item.id], content_name: item.name, content_type: 'product', contents: [{ id: item.id, quantity: item.quantity }], value: total, currency }, { eventID }))
  reportToServer('AddToCart', eventID, [item], total, currency)
  safely(() => window.gtag?.('event', 'add_to_cart', { currency, value: total, items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: item.quantity }] }))
  safely(() => window.ttq?.track('AddToCart', { contents: [{ content_id: item.id, content_name: item.name, price: item.price, quantity: item.quantity }], content_type: 'product', value: total, currency }))
}

// Once per visit for the same cart, so reloading the checkout page doesn't count a new one.
export function trackInitiateCheckout(items: TrackedLineItem[], currency: string) {
  if (typeof window === 'undefined' || !items.length) return
  const key = `tracked-checkout:${items.map(i => `${i.id}x${i.quantity}`).sort().join(',')}`
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1') } catch {}
  const total = value(items)
  const eventID = newEventId('InitiateCheckout')
  safely(() => window.fbq?.('track', 'InitiateCheckout', { content_ids: items.map(i => i.id), contents: items.map(i => ({ id: i.id, quantity: i.quantity })), content_type: 'product', num_items: items.reduce((s, i) => s + i.quantity, 0), value: total, currency }, { eventID }))
  reportToServer('InitiateCheckout', eventID, items, total, currency)
  safely(() => window.gtag?.('event', 'begin_checkout', { currency, value: total, items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })) }))
  safely(() => window.ttq?.track('InitiateCheckout', { contents: items.map(i => ({ content_id: i.id, content_name: i.name, price: i.price, quantity: i.quantity })), content_type: 'product', value: total, currency }))
}

export function trackSearch(query: string) {
  const q = query.trim().slice(0, 100)
  if (typeof window === 'undefined' || !q) return
  safely(() => window.fbq?.('track', 'Search', { search_string: q }))
  safely(() => window.gtag?.('event', 'search', { search_term: q }))
  safely(() => window.ttq?.track('Search', { query: q }))
}

export function trackLead() {
  if (typeof window === 'undefined') return
  safely(() => window.fbq?.('track', 'Lead'))
  safely(() => window.gtag?.('event', 'generate_lead'))
  safely(() => window.ttq?.track('SubmitForm'))
}

// `customer` holds SHA-256 hashes (made on the server) of the buyer's email and phone, so the
// platforms can match the sale to the person who saw the ad without receiving them in plain
// text ("advanced matching"). It improves how many cash-on-delivery sales get credited to ads.
export function trackPurchase(order: { orderNumber: string; value: number; currency: string; items: TrackedLineItem[]; customer?: { em?: string; ph?: string } }) {
  if (typeof window === 'undefined') return
  const em = order.customer?.em
  const ph = order.customer?.ph
  if ((em || ph) && window.__metaPixelId) safely(() => window.fbq?.('init', window.__metaPixelId, { ...(em ? { em } : {}), ...(ph ? { ph } : {}) }))
  if (em || ph) safely(() => window.ttq?.identify?.({ ...(em ? { email: em } : {}), ...(ph ? { phone_number: ph } : {}) }))
  safely(() => window.fbq?.('track', 'Purchase', {
    value: order.value,
    currency: order.currency,
    content_ids: order.items.map(i => i.id),
    contents: order.items.map(i => ({ id: i.id, quantity: i.quantity })),
    content_type: 'product',
    num_items: order.items.reduce((s, i) => s + i.quantity, 0),
  }, { eventID: `purchase-${order.orderNumber}` }))
  if (window.__googleAdsSendTo) safely(() => window.gtag?.('event', 'conversion', { send_to: window.__googleAdsSendTo, value: order.value, currency: order.currency, transaction_id: order.orderNumber }))
  safely(() => window.gtag?.('event', 'purchase', {
    transaction_id: order.orderNumber,
    value: order.value,
    currency: order.currency,
    items: order.items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  }))
  safely(() => window.ttq?.track('CompletePayment', {
    contents: order.items.map(i => ({ content_id: i.id, content_name: i.name, price: i.price, quantity: i.quantity })),
    content_type: 'product',
    value: order.value,
    currency: order.currency,
  }, { event_id: `purchase-${order.orderNumber}` }))
}

// A change of page inside the store. Meta's own counting of address changes is off (components/tracking-scripts.tsx),
// so each one is sent here, once, with an id the server's copy shares.
export function trackPageView() {
  if (typeof window === 'undefined' || !window.__metaPixelId) return
  const eventID = newEventId('PageView')
  safely(() => window.fbq?.('track', 'PageView', {}, { eventID }))
  reportToServer('PageView', eventID, [], 0, '')
}
