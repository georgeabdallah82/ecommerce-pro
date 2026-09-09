import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('orderEdits.view')
    const orderId = new URL(req.url).searchParams.get('orderId')
    return json(await db.orderEdit.findMany({ where: orderId ? { orderId } : undefined, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orderEdits.manage')
    const b = await req.json()
    const orderId = String(b.orderId || '')
    if (!orderId) return json({ error: 'orderId is required' }, { status: 400 })
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })
    if (['CANCELLED','REFUNDED'].includes(order.status)) return json({ error: 'Cancelled or fully refunded orders cannot be edited' }, { status: 409 })
    const items = Array.isArray(b.items) ? b.items : []
    const subtotalAfter = items.reduce((s: number, i: any) => s + Math.max(0, Math.trunc(Number(i.totalPrice) || 0)), 0)
    const edit = await db.orderEdit.create({ data: { orderId, status: 'OPEN', subtotalBefore: order.subtotal, subtotalAfter, deltaTotal: subtotalAfter - order.subtotal, reason: b.reason ? String(b.reason) : null, createdBy: actor.id, items: { create: items.map((i: any) => ({ orderItemId: i.orderItemId ? String(i.orderItemId) : null, productId: String(i.productId), variantId: i.variantId ? String(i.variantId) : null, quantity: Math.max(0, Math.trunc(Number(i.quantity) || 0)), unitPrice: Math.max(0, Math.trunc(Number(i.unitPrice) || 0)), totalPrice: Math.max(0, Math.trunc(Number(i.totalPrice) || 0)) })) } }, include: { items: true } })
    await audit(actor.id, 'order_edit.created', 'OrderEdit', edit.id, { orderId, deltaTotal: edit.deltaTotal })
    return json({ orderEdit: edit }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create order edit' }, { status: 400 }) }
}
