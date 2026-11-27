import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'

const noStore = { 'Cache-Control': 'private, no-store' }

// Shoppers' product questions for the Android admin app, unanswered first. Answering, showing or
// deleting goes through /api/admin/questions, the same as Admin > Content > Questions.
export async function GET(req: Request) {
  try {
    await requirePermission('reviews.view')
    const filter = new URL(req.url).searchParams.get('filter') === 'all' ? 'all' : 'open'
    const rows = await db.productQuestion.findMany({
      where: filter === 'open' ? { answer: null } : {},
      include: { product: { select: { id: true, name: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const open = await db.productQuestion.count({ where: { answer: null } })
    return json({
      open,
      questions: rows.map(q => ({
        id: q.id, question: q.question, answer: q.answer, published: q.published, name: q.name, createdAt: q.createdAt, answeredAt: q.answeredAt,
        product: { id: q.product.id, name: q.product.name, imageUrl: q.product.images[0]?.url ?? null },
      })),
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load questions', 400, noStore) }
}
