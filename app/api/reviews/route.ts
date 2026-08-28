import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return json({ error: 'Please sign in' }, { status: 401 })

    const b = await req.json()
    const productId = String(b.productId || '').trim()
    const rating = Number(b.rating)
    if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'Invalid review' }, { status: 400 })

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
        data: {
          productId,
          userId: user.id,
          rating,
          title: b.title ? String(b.title).slice(0, 140) : null,
          body: b.body ? String(b.body).slice(0, 2000) : null,
        },
        select: {
          id: true,
          productId: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
        },
      })
    })
    return json({ review }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to submit review'
    return json({ error: message }, { status: message === 'You have already reviewed this product' ? 409 : 400 })
  }
}
