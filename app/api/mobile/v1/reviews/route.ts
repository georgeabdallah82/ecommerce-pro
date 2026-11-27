import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'

const noStore = { 'Cache-Control': 'private, no-store' }

// Reviews for the Android admin app, waiting ones first, with only what the phone shows (the web's
// GET /api/admin/reviews sends every product field). Approving, featuring and removing a photo go
// through PATCH /api/admin/reviews.
export async function GET(req: Request) {
  try {
    await requirePermission('reviews.view')
    const filter = new URL(req.url).searchParams.get('filter') === 'all' ? 'all' : 'waiting'
    const [rows, waiting] = await Promise.all([
      db.review.findMany({
        where: filter === 'waiting' ? { approved: false } : {},
        select: {
          id: true, rating: true, title: true, body: true, photos: true, approved: true, featured: true, createdAt: true, authorName: true,
          user: { select: { name: true } }, order: { select: { id: true, orderNumber: true } },
          product: { select: { id: true, name: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.review.count({ where: { approved: false } }),
    ])
    return json({
      waiting,
      reviews: rows.map(r => ({
        id: r.id, rating: r.rating, title: r.title, body: r.body, photos: r.photos, approved: r.approved, featured: r.featured, createdAt: r.createdAt,
        author: r.user?.name || r.authorName || 'Customer', orderId: r.order?.id ?? null, orderNumber: r.order?.orderNumber ?? null,
        product: { id: r.product.id, name: r.product.name, imageUrl: r.product.images[0]?.url ?? null },
      })),
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load reviews', 400, noStore) }
}
