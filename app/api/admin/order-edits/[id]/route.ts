import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params

    const order = await db.$transaction(async tx => {
      const edit = await tx.orderEdit.findUnique({ where: { id }, include: { items: true } })
      if (!edit) throw new Error('Order edit not found')
      if (edit.status !== 'OPEN') throw new Error('Order edit is no longer open')

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

    await audit(actor.id, 'order_edit.committed', 'OrderEdit', id, { orderId: order.id, newSubtotal: order.subtotal, newTotal: order.grandTotal })
    return json({ order })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to commit order edit'
    const status = message === 'Order edit not found' || message === 'Order not found' ? 404 : message === 'Order edit is no longer open' ? 409 : message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message.includes('cannot be edited') ? 409 : 400
    if (status >= 500) console.error('order edit commit failed', e)
    return json({ error: message }, { status })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const discarded = await db.$transaction(async tx => {
      const edit = await tx.orderEdit.findUnique({ where: { id } })
      if (!edit) throw new Error('Order edit not found')
      if (edit.status !== 'OPEN') throw new Error('Order edit is no longer open')
      return tx.orderEdit.update({ where: { id }, data: { status: 'DISCARDED' } })
    })
    await audit(actor.id, 'order_edit.discarded', 'OrderEdit', id, { orderId: discarded.orderId })
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to discard order edit'
    const status = message === 'Order edit not found' ? 404 : message === 'Order edit is no longer open' ? 409 : message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return json({ error: message }, { status })
  }
}
