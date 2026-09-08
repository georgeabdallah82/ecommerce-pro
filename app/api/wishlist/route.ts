import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return json({ items: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

  const limit = consumeRateLimit(`wishlist-read:${user.id}:${clientIp(req.headers)}`, 60, 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'private, no-store' } })

  const items = await db.wishlistItem.findMany({
    where: { userId: user.id, product: { status: 'ACTIVE' } },
    select: {
      id: true,
      productId: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          basePrice: true,
          compareAtPrice: true,
          status: true,
          images: {
            select: { id: true, url: true, alt: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return json({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return json({ error: 'Please sign in' }, { status: 401 })

    const limit = consumeRateLimit(`wishlist-write:${user.id}:${clientIp(req.headers)}`, 60, 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many wishlist requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const body = await req.json()
    const productId = String(body.productId || '').trim()
    if (!productId || productId.length > 100) return json({ error: 'Product required' }, { status: 400 })

    const product = await db.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, select: { id: true } })
    if (!product) return json({ error: 'Product not found' }, { status: 404 })

    const result = await db.$transaction(async tx => {
      const existing = await tx.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId } } })
      if (existing) {
        await tx.wishlistItem.delete({ where: { id: existing.id } })
        return { saved: false }
      }
      try {
        await tx.wishlistItem.create({ data: { userId: user.id, productId } })
        return { saved: true }
      } catch {
        const afterRace = await tx.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId } } })
        return { saved: !!afterRace }
      }
    })

    return json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return json({ error: 'Unable to update wishlist' }, { status: 400 })
  }
}
