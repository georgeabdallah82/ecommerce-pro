import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'

export async function GET() {
  try {
    await requirePermission('reports.view')
    const [products, categories, collections] = await Promise.all([
      db.product.findMany({ select: { id: true, name: true, sku: true }, orderBy: { name: 'asc' }, take: 10000 }),
      db.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 5000 }),
      db.collection.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 5000 }),
    ])
    return NextResponse.json({ products, categories, collections }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error && error.message === 'FORBIDDEN' ? 'Forbidden' : 'Unauthorized'
    return NextResponse.json({ error: message }, { status: message === 'Forbidden' ? 403 : 401 })
  }
}
