import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { sendNewReviewAlert } from '@/lib/push'
import { runInBackground } from '@/lib/background'
import { isValidOrderReviewToken } from '@/lib/order-access'
import { orderCustomerName, parseOrderReviews, reviewAuthorName } from '@/lib/order-reviews'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// "Rate your order" (app/review/[orderNumber]): saves the ratings for a delivered order. The link's
// code proves the order; no account is needed. Reviews wait for approval in Admin › Reviews.
export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`order-review:${clientIp(req.headers)}`, 20, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many review submissions. Please try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterSeconds) } })
    if (Number(req.headers.get('content-length') || 0) > 64 * 1024) return json({ error: 'Review payload is too large' }, { status: 413, headers: NO_STORE })
    const b = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'Invalid review' }, { status: 400, headers: NO_STORE })

    const orderNumber = String(b.orderNumber || '').trim().slice(0, 80)
    if (!orderNumber || !isValidOrderReviewToken(orderNumber, typeof b.token === 'string' ? b.token : '')) return json({ error: 'This review link is not valid.' }, { status: 403, headers: NO_STORE })
    const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, userId: true, status: true, shippingAddressJson: true, items: { select: { productId: true } } } })
    if (!order) return json({ error: 'This review link is not valid.' }, { status: 403, headers: NO_STORE })
    if (order.status !== 'DELIVERED') return json({ error: 'You can rate your order once it is delivered.' }, { status: 409, headers: NO_STORE })

    const parsed = parseOrderReviews(b.reviews, new Set(order.items.map(i => i.productId)))
    if (parsed.error) return json({ error: parsed.error }, { status: 400, headers: NO_STORE })
    const authorName = reviewAuthorName(b.name, orderCustomerName(order.shippingAddressJson))
    if (!authorName) return json({ error: 'Please add your name.' }, { status: 400, headers: NO_STORE })

    const products = await db.product.findMany({ where: { id: { in: parsed.reviews.map(r => r.productId) }, status: 'ACTIVE' }, select: { id: true, name: true } })
    const names = new Map(products.map(p => [p.id, p.name]))
    // Already rated from this order (or by the same account): kept as it is, not doubled.
    const existing = await db.review.findMany({
      where: { productId: { in: [...names.keys()] }, OR: [{ orderId: order.id }, ...(order.userId ? [{ userId: order.userId }] : [])] },
      select: { productId: true },
    })
    const done = new Set(existing.map(r => r.productId))
    const toSave = parsed.reviews.filter(r => names.has(r.productId) && !done.has(r.productId))

    const created: Array<{ id: string; productId: string; rating: number }> = []
    for (const review of toSave) {
      try {
        created.push(await db.review.create({
          data: { productId: review.productId, userId: order.userId || null, orderId: order.id, authorName, rating: review.rating, body: review.body },
          select: { id: true, productId: true, rating: true },
        }))
      } catch (error) {
        // Sent twice at the same moment: the one-review-per-product-per-order rule keeps the first.
        if (!(error instanceof Error && /unique/i.test(error.message))) throw error
      }
    }
    if (created.length) {
      const first = created[0]
      const productName = created.length > 1 ? `${names.get(first.productId)} + ${created.length - 1} more` : String(names.get(first.productId) || 'A product')
      runInBackground(sendNewReviewAlert({ id: first.id, productName, rating: first.rating }).catch(error => console.error('[push] new review alert failed', error)))
    }
    return json({ saved: created.length, alreadyRated: parsed.reviews.length - toSave.length }, { status: 201, headers: NO_STORE })
  } catch (e) {
    console.error('[reviews] order review failed', e)
    return json({ error: 'Unable to submit review right now' }, { status: 500, headers: NO_STORE })
  }
}
