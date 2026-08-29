import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return json({ error: 'Please sign in' }, { status: 401, headers: NO_STORE })

    const limit = consumeRateLimit(`review:${user.id}:${clientIp(req)}`, 10, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many review submissions. Please try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterSeconds) } })

    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > 16 * 1024) return json({ error: 'Review payload is too large' }, { status: 413, headers: NO_STORE })

    const b = await req.json().catch(() => null)
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'Invalid review' }, { status: 400, headers: NO_STORE })

    const productId = String((b as Record<string, unknown>).productId || '').trim()
    const rating = Number((b as Record<string, unknown>).rating)
    if (!productId || productId.length > 100 || !Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'Invalid review' }, { status: 400, headers: NO_STORE })

    const rawTitle = (b as Record<string, unknown>).title
    const rawBody = (b as Record<string, unknown>).body
    if (rawTitle !== undefined && rawTitle !== null && typeof rawTitle !== 'string') return json({ error: 'Invalid review title' }, { status: 400, headers: NO_STORE })
    if (rawBody !== undefined && rawBody !== null && typeof rawBody !== 'string') return json({ error: 'Invalid review body' }, { status: 400, headers: NO_STORE })

    const titleText = typeof rawTitle === 'string' ? rawTitle.trim() : ''
    const bodyText = typeof rawBody === 'string' ? rawBody.trim() : ''
    if (titleText.length > 140 || bodyText.length > 2000) return json({ error: 'Review content is too long' }, { status: 400, headers: NO_STORE })
    const title = titleText || null
    const body = bodyText || null

    const product = await db.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, select: { id: true } })
    if (!product) return json({ error: 'Product not found' }, { status: 404, headers: NO_STORE })

    const purchase = await db.orderItem.findFirst({
      where: {
        productId,
        order: { userId: user.id, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
      },
      select: { id: true },
    })
    if (!purchase) return json({ error: 'You can review products you purchased' }, { status: 403, headers: NO_STORE })

    const review = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}:${productId}`}))`
      const existing = await tx.review.findFirst({ where: { productId, userId: user.id }, select: { id: true } })
      if (existing) throw new Error('You have already reviewed this product')
      return tx.review.create({
        data: { productId, userId: user.id, rating, title, body },
        select: { id: true, productId: true, rating: true, title: true, body: true, createdAt: true },
      })
    })
    return json({ review }, { status: 201, headers: NO_STORE })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'You have already reviewed this product') return json({ error: message }, { status: 409, headers: NO_STORE })
    console.error('[reviews] submission failed', e)
    return json({ error: 'Unable to submit review right now' }, { status: 500, headers: NO_STORE })
  }
}
