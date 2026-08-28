import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return json({ error: 'Please sign in' }, { status: 401 })

    const limit = consumeRateLimit(`review:${user.id}:${clientIp(req)}`, 10, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many review submissions. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > 16 * 1024) return json({ error: 'Review payload is too large' }, { status: 413 })

    const b = await req.json()
    const productId = String(b.productId || '').trim()
    const rating = Number(b.rating)
    if (!productId || productId.length > 100 || !Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'Invalid review' }, { status: 400 })

    const title = b.title ? String(b.title).slice(0, 140) : null
    const body = b.body ? String(b.body).slice(0, 2000) : null
    if (b.title && String(b.title).length > 140 || b.body && String(b.body).length > 2000) return json({ error: 'Review content is too long' }, { status: 400 })

    const product = await db.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, select: { id: true } })
    if (!product) return json({ error: 'Product not found' }, { status: 404 })

    const purchase = await db.orderItem.findFirst({
      where: {
        productId,
        order: { userId: user.id, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
      },
      select: { id: true },
    })
    if (!purchase) return json({ error: 'You can review products you purchased' }, { status: 403 })

    const review = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}:${productId}`}))`
      const existing = await tx.review.findFirst({ where: { productId, userId: user.id }, select: { id: true } })
      if (existing) throw new Error('You have already reviewed this product')
      return tx.review.create({
        data: { productId, userId: user.id, rating, title, body },
        select: { id: true, productId: true, rating: true, title: true, body: true, createdAt: true },
      })
    })
    return json({ review }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'You have already reviewed this product') return json({ error: message }, { status: 409 })
    console.error('[reviews] submission failed')
    return json({ error: 'Unable to submit review' }, { status: 400 })
  }
}
