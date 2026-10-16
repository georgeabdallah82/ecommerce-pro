// Orders the team types in by hand (Admin > Orders > New order): customers who order on WhatsApp,
// Instagram, by phone or in the shop. Shared by the form and the API so both use the same words.

export const MANUAL_ORDER_SOURCES = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'phone', label: 'Phone call' },
  { id: 'in_store', label: 'In the shop' },
  { id: 'other', label: 'Other' },
] as const

export type ManualOrderSource = typeof MANUAL_ORDER_SOURCES[number]['id']

export function manualOrderSourceLabel(source: string) {
  return MANUAL_ORDER_SOURCES.find(x => x.id === source)?.label || 'Other'
}

// The first line of the order's history, e.g. "Order taken on WhatsApp by Rana."
export function manualOrderMessage(source: string, takenBy: string) {
  const by = takenBy.trim() ? ` by ${takenBy.trim()}` : ''
  if (source === 'in_store') return `Order taken in the shop${by}.`
  if (source === 'phone') return `Order taken on a phone call${by}.`
  if (source === 'other' || !MANUAL_ORDER_SOURCES.some(x => x.id === source)) return `Order added by hand${by}.`
  return `Order taken on ${manualOrderSourceLabel(source)}${by}.`
}

// The delivery fee a rate charges for this basket (free above the rate's threshold), in cents.
export function deliveryFee(rate: { price: number; freeAbove: number | null } | null | undefined, subtotal: number) {
  if (!rate) return 0
  return rate.freeAbove !== null && subtotal >= rate.freeAbove ? 0 : rate.price
}
