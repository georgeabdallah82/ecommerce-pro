import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

// "Cash received": the driver handed over the cash from their deliveries. Marks exactly the
// orders shown on the page (so a delivery made a second later is not counted by mistake).
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json().catch(() => ({})) as { driverId?: unknown; orderIds?: unknown }
    const driverId = String(body.driverId || '')
    const ids = Array.isArray(body.orderIds) ? body.orderIds.map(String).slice(0, 500) : []
    if (!driverId || !ids.length) return json({ error: 'Nothing to mark as received' }, { status: 400 })
    const open = await db.order.findMany({ where: { id: { in: ids }, driverId, status: 'DELIVERED', cashCollected: { gt: 0 }, cashSettledAt: null }, select: { id: true, cashCollected: true } })
    if (!open.length) return json({ error: 'This cash was already marked as received' }, { status: 409 })
    const now = new Date()
    await db.order.updateMany({ where: { id: { in: open.map(o => o.id) }, cashSettledAt: null }, data: { cashSettledAt: now } })
    const amount = open.reduce((sum, o) => sum + (o.cashCollected || 0), 0)
    await audit(actor.id, 'driver.cash_received', 'Driver', driverId, { orders: open.length, amount })
    return json({ orders: open.length, amount, settledAt: now.toISOString() })
  } catch (error) { return routeError(error, 'Unable to save', 400) }
}
