// Reviews left from a delivered order's "rate your order" link (app/review/[orderNumber],
// POST /api/reviews/order). The link works without an account, so the order itself is the proof
// of purchase: only the products in it can be rated, once each, and every review waits for the
// owner's approval in Admin › Reviews like any other.

export const REVIEW_BODY_MAX = 2000
export const REVIEW_NAME_MAX = 60

import { parseReviewPhotos } from '@/lib/review-photos'

export type OrderReviewInput = { productId: string; rating: number; body: string | null; photos: string[] }

// The reviews sent from the page: products from this order only, a whole-star rating 1-5, an
// optional comment. Products left unrated are simply not sent.
export function parseOrderReviews(raw: unknown, orderProductIds: Set<string>): { reviews: OrderReviewInput[]; error?: string } {
  if (!Array.isArray(raw) || !raw.length) return { reviews: [], error: 'Choose a star rating for at least one product.' }
  if (raw.length > 50) return { reviews: [], error: 'Invalid review' }
  const reviews: OrderReviewInput[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { reviews: [], error: 'Invalid review' }
    const productId = String((entry as Record<string, unknown>).productId || '').trim()
    const rating = Number((entry as Record<string, unknown>).rating)
    const rawBody = (entry as Record<string, unknown>).body
    if (!orderProductIds.has(productId) || seen.has(productId)) return { reviews: [], error: 'Invalid review' }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { reviews: [], error: 'Invalid review' }
    if (rawBody !== undefined && rawBody !== null && typeof rawBody !== 'string') return { reviews: [], error: 'Invalid review' }
    const body = typeof rawBody === 'string' ? rawBody.trim() : ''
    if (body.length > REVIEW_BODY_MAX) return { reviews: [], error: 'Review content is too long' }
    // Photos uploaded from the page first (app/api/reviews/photo), up to 3.
    const photos = parseReviewPhotos((entry as Record<string, unknown>).photos)
    if (photos.error) return { reviews: [], error: photos.error }
    seen.add(productId)
    reviews.push({ productId, rating, body: body || null, photos: photos.photos })
  }
  return { reviews }
}

// The name shown with the review (as "Maya H." on the product page). Empty means "use the name
// on the order".
export function reviewAuthorName(raw: unknown, fallback: string) {
  const typed = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  return (typed || fallback.replace(/\s+/g, ' ').trim()).slice(0, REVIEW_NAME_MAX)
}

export function orderCustomerName(shippingAddressJson: string | null | undefined) {
  try {
    const a = JSON.parse(shippingAddressJson || '{}') || {}
    return `${String(a.firstName || '').trim()} ${String(a.lastName || '').trim()}`.trim()
  } catch { return '' }
}

// The message staff send on WhatsApp from a delivered order (Admin › Orders › order), and the
// same words the review email uses.
export function reviewRequestMessage(input: { storeName: string; firstName: string; orderNumber: string; link: string }) {
  return [
    `Hi${input.firstName ? ` ${input.firstName}` : ''}, thank you for your order #${input.orderNumber} from ${input.storeName || 'our store'}!`,
    '',
    'We hope you like it. Could you rate what you bought? It takes 30 seconds and helps other customers:',
    input.link,
  ].join('\n')
}
