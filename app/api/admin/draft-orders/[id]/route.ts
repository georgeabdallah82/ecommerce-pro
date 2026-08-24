import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { reserveStock } from '@/lib/inventory'
import { json } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const b = await req.json()
    const draft = await db.draftOrder.findUnique({ where: { id }, include: { items: true } })
    if (!draft) return json({ error: 'Draft order not found' }, { status: 404 })
    if (draft.status === 'COMPLETED') return json({ error: 'Completed draft orders cannot be edited' }, { status: 409 })
    const updated = await db.draftOrder.update({ where: { id }, data: {
      ...(b.email !== undefined ? { email: String(b.email).trim() } : {}),
      ...(b.phone !== undefined ? { phone: b.phone ? String(b.phone) : null } : {}),
      ...(b.notes !== undefined ? { notes: b.notes ? String(b.notes) : null } : {}),
      ...(b.status !== undefined && ['DRAFT','OPEN','CANCELLED'].includes(String(b.status)) ? { status: b.status } : {}),
      ...(b.shippingAddress !== undefined ? { shippingAddressJson: b.shippingAddress ? JSON.stringify(b.shippingAddress) : null } : {}),
      ...(b.billingAddress !== undefined ? { billingAddressJson: b.billingAddress ? JSON.stringify(b.billingAddress) : null } : {}),
    }, include: { items: true } })
    await audit(actor.id, 'draft_order.updated', 'DraftOrder', id, { fields: Object.keys(b) })
    return json({ draftOrder: updated })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update draft order' }, { status: 400 }) }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const draft = await db.draftOrder.findUnique({ where: { id }, include: { items: true } })
    if (!draft) return json({ error: 'Draft order not found' }, { status: 404 })
    if (draft.status === 'COMPLETED') return json({ error: 'Draft order is already completed' }, { status: 409 })
    if (draft.status === 'CANCELLED') return json({ error: 'Cancelled draft order cannot be completed' }, { status: 409 })
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
    const productIds = [...new Set(draft.items.map(i => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: productIds }, status: 'ACTIVE' }, include: { variants: true, inventory: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    const result = await db.$transaction(async tx => {
      for (const item of draft.items) {
        const product = byId.get(item.productId)
        if (!product) throw new Error(`Product ${item.productId} is not available`)
        await reserveStock(tx, product, item.variantId, item.quantity, orderNumber)
      }
      const order = await tx.order.create({ data: {
        orderNumber,
        userId: draft.customerId,
        email: draft.email,
        phone: draft.phone,
        subtotal: draft.subtotal,
        discountTotal: draft.discountTotal,
        shippingTotal: draft.shippingTotal,
        taxTotal: draft.taxTotal,
        grandTotal: draft.grandTotal,
        currency: draft.currency,
        paymentMethod: 'COD',
        shippingAddressJson: draft.shippingAddressJson || JSON.stringify({}),
        billingAddressJson: draft.billingAddressJson,
        notes: draft.notes,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        fulfillmentStatus: 'UNFULFILLED',
        items: { create: draft.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice })) },
        events: { create: { status: 'PENDING', message: `Created from draft order ${draft.orderNumber}.` } },
        paymentTransactions: { create: { provider: 'manual', status: 'created', amount: draft.grandTotal, currency: draft.currency } },
      } })
      await tx.draftOrder.update({ where: { id }, data: { status: 'COMPLETED', completedOrderId: order.id } })
      return order
    })
    await audit(actor.id, 'draft_order.completed', 'DraftOrder', id, { orderId: result.id, orderNumber: result.orderNumber })
    return json({ order: result })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to complete draft order' }, { status: 400 }) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const draft = await db.draftOrder.findUnique({ where: { id } })
    if (!draft) return json({ error: 'Draft order not found' }, { status: 404 })
    if (draft.status === 'COMPLETED') return json({ error: 'Completed draft orders cannot be deleted' }, { status: 409 })
    await db.draftOrder.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit(actor.id, 'draft_order.cancelled', 'DraftOrder', id, { orderNumber: draft.orderNumber })
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to cancel draft order' }, { status: 400 }) }
}
