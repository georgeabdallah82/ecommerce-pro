import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

// Gives orders to a driver (or takes them off: driverId null) from the delivery sheet. Only
// orders still on their way: delivered ones keep the driver who delivered them.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json().catch(() => ({})) as { orderIds?: unknown; driverId?: unknown }
    const ids = Array.isArray(body.orderIds) ? body.orderIds.map(String).slice(0, 300) : []
    const driverId = body.driverId ? String(body.driverId) : null
    if (!ids.length) return json({ error: 'Choose orders' }, { status: 400 })
    if (driverId && !await db.driver.findFirst({ where: { id: driverId, active: true }, select: { id: true } })) return json({ error: 'Driver not found' }, { status: 404 })
    const result = await db.order.updateMany({ where: { id: { in: ids }, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] } }, data: { driverId } })
    await audit(actor.id, 'driver.orders_assigned', 'Driver', driverId || undefined, { orders: ids.length, updated: result.count })
    return json({ updated: result.count })
  } catch (error) { return routeError(error, 'Unable to give the orders to the driver', 400) }
}
