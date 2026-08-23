import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { canCustomerCancel } from '@/lib/orders'
import { json } from '@/lib/utils'

export async function POST(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    const user = await requireUser()
    const { orderNumber } = await params
    const result = await db.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { orderNumber, userId: user.id }, include: { items: true } })
      if (!order) throw new Error('Order not found')
      if (!canCustomerCancel(order.status)) throw new Error('This order can no longer be cancelled online')

      for (const item of order.items) {
        const rows = await tx.inventoryItem.findMany({ where: { productId: item.productId, variantId: item.variantId || null }, orderBy: { id: 'asc' } })
        let remaining = item.quantity
        for (const row of rows) {
          if (remaining <= 0) break
          const release = Math.min(remaining, row.reserved)
          if (release <= 0) continue
          const affected = await tx.inventoryItem.updateMany({ where: { id: row.id, reserved: { gte: release } }, data: { reserved: { decrement: release } } })
          if (affected.count !== 1) throw new Error(`Stock reservation changed for ${item.name}. Please retry.`)
          await tx.inventoryMovement.create({ data: { inventoryId: row.id, type: 'SALE_RELEASE', quantity: -release, reason: 'Customer cancelled order', referenceId: order.orderNumber } })
          remaining -= release
        }
        if (remaining > 0) throw new Error(`Unable to release reservation for ${item.name}. Please contact support.`)
      }

      return tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', fulfillmentStatus: 'UNFULFILLED', events: { create: { status: 'CANCELLED', message: 'Order cancelled by customer.' } } },
      })
    })

    return json({ order: result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to cancel order'
    return json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'Order not found' ? 404 : 400 })
  }
}
