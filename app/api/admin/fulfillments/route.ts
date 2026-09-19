import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const orderId = new URL(req.url).searchParams.get('orderId')?.trim()
    if (!orderId) return json({ error: 'orderId is required' }, { status: 400 })
    const fulfillments = await db.fulfillment.findMany({ where: { orderId }, include: { lines: true }, orderBy: { createdAt: 'desc' } })
    return json({ fulfillments })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}
