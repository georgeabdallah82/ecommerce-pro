import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return json({ items: [] })

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
          price: true,
          compareAtPrice: true,
          currency: true,
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

  return json({ items })
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return json({ error: 'Please sign in' }, { status: 401 })
    const body = await req.json()
    const productId = String(body.productId || '').trim()
    if (!productId) return json({ error: 'Product required' }, { status: 400 })

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

    return json(result)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update wishlist' }, { status: 400 })
  }
}
