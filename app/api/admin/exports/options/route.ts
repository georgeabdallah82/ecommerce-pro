import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'

export async function GET() {
  try { await requirePermission('reports.view') } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 403
    return Response.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status })
  }
  const [products, categories, collections] = await Promise.all([
    db.product.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, sku: true, categoryId: true } }),
    db.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.collection.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  return Response.json({ products, categories, collections }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
