import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { isValidOrderReviewToken } from '@/lib/order-access'
import { MAX_REVIEW_PHOTO_BYTES, sniffImageType } from '@/lib/review-photos'
import { saveReviewPhoto } from '@/lib/media-storage'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// One photo for "Rate your order" (app/review/[orderNumber]). Only with the order's review link
// and once the order is delivered; JPEG, PNG or WebP up to 3 MB (the page makes photos smaller
// first). Answers with the photo's address, sent along with the review.
export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`review-photo:${clientIp(req.headers)}`, 30, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many photos. Please try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterSeconds) } })
    if (Number(req.headers.get('content-length') || 0) > MAX_REVIEW_PHOTO_BYTES + 64 * 1024) return json({ error: 'This photo is too large.' }, { status: 413, headers: NO_STORE })
    const form = await req.formData().catch(() => null)
    if (!form) return json({ error: 'Invalid photo' }, { status: 400, headers: NO_STORE })
    const orderNumber = String(form.get('orderNumber') || '').trim().slice(0, 80)
    const token = String(form.get('token') || '')
    if (!orderNumber || !isValidOrderReviewToken(orderNumber, token)) return json({ error: 'This review link is not valid.' }, { status: 403, headers: NO_STORE })
    const order = await db.order.findUnique({ where: { orderNumber }, select: { status: true } })
    if (!order) return json({ error: 'This review link is not valid.' }, { status: 403, headers: NO_STORE })
    if (order.status !== 'DELIVERED') return json({ error: 'You can rate your order once it is delivered.' }, { status: 409, headers: NO_STORE })
    const file = form.get('file')
    if (!file || typeof file === 'string') return json({ error: 'Invalid photo' }, { status: 400, headers: NO_STORE })
    if (file.size > MAX_REVIEW_PHOTO_BYTES) return json({ error: 'This photo is too large.' }, { status: 413, headers: NO_STORE })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type) return json({ error: 'Please choose a photo (JPG or PNG).' }, { status: 415, headers: NO_STORE })
    const url = await saveReviewPhoto(bytes, type)
    return json({ url }, { status: 201, headers: NO_STORE })
  } catch (error) {
    console.error('[reviews] photo upload failed', error)
    return json({ error: 'Unable to add the photo right now' }, { status: 500, headers: NO_STORE })
  }
}
