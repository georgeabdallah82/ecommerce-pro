import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { capRows, LIST_CAP } from '@/lib/admin-list'

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const orderId = new URL(req.url).searchParams.get('orderId')?.trim()
    if (!orderId) return json({ error: 'orderId is required' }, { status: 400 })
    const found = await db.fulfillment.findMany({ where: { orderId }, include: { lines: true }, orderBy: { createdAt: 'desc' }, take: LIST_CAP + 1 })
    const capped = capRows(found, LIST_CAP)
    return json({ fulfillments: capped.rows }, { headers: { 'X-Truncated': String(capped.truncated) } })
  } catch (e) { return routeError(e, 'Forbidden', 403) }
}
