import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const edit = await db.orderEdit.findUnique({ where: { id }, include: { items: true } })
    if (!edit) return json({ error: 'Order edit not found' }, { status: 404 })
    if (edit.status !== 'OPEN') return json({ error: 'Order edit is no longer open' }, { status: 409 })

    const order = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "Order" WHERE "id" = ${edit.orderId} FOR UPDATE`
      const current = await tx.order.findUnique({ where: { id: edit.orderId }, include: { items: true } })
      if (!current) throw new Error('Order not found')
      if (['CANCELLED', 'REFUNDED'].includes(current.status)) throw new Error('Cancelled or refunded orders cannot be edited')

      const oldMap = new Map(current.items.map(i => [i.id, i]))
      for (const item of edit.items) {
        if (item.orderItemId && oldMap.has(item.orderItemId)) {
          await tx.orderItem.update({ where: { id: item.orderItemId }, data: { quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice } })
        } else if (item.quantity > 0) {
          await tx.orderItem.create({ data: { orderId: current.id, productId: item.productId, variantId: item.variantId, name: 'Edited item', sku: 'EDITED', quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice } })
        }
      }
      const subtotal = await tx.orderItem.aggregate({ _sum: { totalPrice: true }, where: { orderId: current.id } })
      const nextSubtotal = Math.max(0, subtotal._sum.totalPrice || 0)
      const delta = nextSubtotal - current.subtotal
      const nextGrand = Math.max(0, current.grandTotal + delta)
      const updated = await tx.order.update({ where: { id: current.id }, data: { subtotal: nextSubtotal, grandTotal: nextGrand } })
      await tx.orderEvent.create({ data: { orderId: current.id, status: current.status, message: `Order edited by ${actor.name}.` } })
      await tx.orderEdit.update({ where: { id }, data: { status: 'COMMITTED', committedAt: new Date(), subtotalAfter: nextSubtotal, deltaTotal: delta } })
      return updated
    })

    await audit(actor.id, 'order_edit.committed', 'OrderEdit', id, { orderId: edit.orderId, newSubtotal: order.subtotal, newTotal: order.grandTotal })
    return json({ order })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to commit order edit' }, { status: 400 }) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const edit = await db.orderEdit.findUnique({ where: { id } })
    if (!edit) return json({ error: 'Order edit not found' }, { status: 404 })
    if (edit.status !== 'OPEN') return json({ error: 'Order edit is no longer open' }, { status: 409 })
    await db.orderEdit.update({ where: { id }, data: { status: 'DISCARDED' } })
    await audit(actor.id, 'order_edit.discarded', 'OrderEdit', id, { orderId: edit.orderId })
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to discard order edit' }, { status: 400 }) }
}
