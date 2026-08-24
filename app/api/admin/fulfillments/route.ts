import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const orderId = new URL(req.url).searchParams.get('orderId')
    const rows = await db.fulfillment.findMany({ where: orderId ? { orderId } : undefined, include: { lines: true }, orderBy: { createdAt: 'desc' }, take: 200 })
    return json(rows)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const b = await req.json()
    const orderId = String(b.orderId || '')
    if (!orderId) return json({ error: 'orderId is required' }, { status: 400 })
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })
    const lines = Array.isArray(b.lines) ? b.lines.map((x: any) => ({ orderItemId: String(x.orderItemId), productId: String(x.productId), variantId: x.variantId ? String(x.variantId) : null, quantity: Math.max(1, Math.trunc(Number(x.quantity) || 0)) })) : []
    if (!lines.length) return json({ error: 'At least one fulfillment line is required' }, { status: 400 })
    const fulfillment = await db.fulfillment.create({ data: { orderId, status: 'PENDING', trackingNumber: b.trackingNumber ? String(b.trackingNumber) : null, trackingCompany: b.trackingCompany ? String(b.trackingCompany) : null, trackingUrl: b.trackingUrl ? String(b.trackingUrl) : null, locationId: b.locationId ? String(b.locationId) : null, lines: { create: lines } } })
    await audit(actor.id, 'fulfillment.created', 'Fulfillment', fulfillment.id, { orderId, lineCount: lines.length })
    return json({ fulfillment }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create fulfillment' }, { status: 400 }) }
}
