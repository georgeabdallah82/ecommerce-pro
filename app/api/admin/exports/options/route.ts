import { routeError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'

export async function GET() {
  try {
    await requirePermission('reports.view')
    const [products, collections] = await Promise.all([
      db.product.findMany({ select: { id: true, name: true, sku: true }, orderBy: { name: 'asc' }, take: 10000 }),
      db.collection.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 5000 }),
    ])
    return NextResponse.json({ products, collections }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    // Sign-in/permission errors → 401/403; a database failure → 500 (routeError), not "Unauthorized".
    return routeError(error, 'Unable to load export options', 400)
  }
}
