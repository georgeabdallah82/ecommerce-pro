import { InventoryMovementType } from '@prisma/client'

export function availableQuantity(row: { quantity: number; reserved: number }) {
  return Math.max(0, row.quantity - row.reserved)
}

export async function reserveStock(tx: any, product: any, variantId: string | null | undefined, quantity: number, referenceId: string) {
  if (!product.trackInventory || product.continueSellingWhenOutOfStock) return []

  const variantRows = variantId ? product.inventory.filter((x: any) => x.variantId === variantId) : []
  const rows = variantRows.length > 0 ? variantRows : product.inventory.filter((x: any) => !x.variantId)

  let remaining = quantity
  const reservations: Array<{ inventoryId: string; quantity: number }> = []
  for (const row of rows) {
    if (remaining <= 0) break
    const canReserve = Math.min(remaining, availableQuantity(row))
    if (canReserve <= 0) continue
    const affected = await tx.inventoryItem.updateMany({ where: { id: row.id, reserved: { lte: row.quantity - canReserve } }, data: { reserved: { increment: canReserve } } })
    if (affected.count === 1) {
      await tx.inventoryMovement.create({ data: { inventoryId: row.id, type: InventoryMovementType.SALE_RESERVATION, quantity: canReserve, reason: 'Checkout reservation', referenceId } })
      reservations.push({ inventoryId: row.id, quantity: canReserve })
      remaining -= canReserve
    }
  }
  if (remaining > 0) throw new Error(`Not enough stock for ${product.name}`)
  return reservations
}

export async function releaseOrderReservations(tx: any, orderId: string, reason = 'Order reservation released') {
  const order = await tx.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  const reservations = await tx.inventoryMovement.findMany({ where: { type: InventoryMovementType.SALE_RESERVATION, referenceId: order.orderNumber } })
  for (const reservation of reservations) {
    const released = await tx.inventoryMovement.aggregate({ _sum: { quantity: true }, where: { inventoryId: reservation.inventoryId, referenceId: order.orderNumber, type: InventoryMovementType.SALE_RELEASE } })
    const fulfilled = await tx.inventoryMovement.aggregate({ _sum: { quantity: true }, where: { inventoryId: reservation.inventoryId, referenceId: order.orderNumber, type: InventoryMovementType.SALE_FULFILLMENT } })
    const remaining = Math.max(0, reservation.quantity - (released._sum.quantity ?? 0) - (fulfilled._sum.quantity ?? 0))
    if (!remaining) continue
    const row = await tx.inventoryItem.findUnique({ where: { id: reservation.inventoryId } })
    if (!row) continue
    const releaseQty = Math.min(row.reserved, remaining)
    if (!releaseQty) continue
    await tx.inventoryItem.update({ where: { id: row.id }, data: { reserved: { decrement: releaseQty } } })
    await tx.inventoryMovement.create({ data: { inventoryId: row.id, type: InventoryMovementType.SALE_RELEASE, quantity: releaseQty, reason, referenceId: order.orderNumber } })
  }
}

export async function fulfillOrderStock(tx: any, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } })
  if (!order) throw new Error('Order not found')

  for (const item of order.items) {
    if (!item.product.trackInventory || item.product.continueSellingWhenOutOfStock) continue
    const reservations = await tx.inventoryMovement.findMany({ where: { referenceId: order.orderNumber, type: InventoryMovementType.SALE_RESERVATION, inventory: { productId: item.productId } }, orderBy: { createdAt: 'asc' } })
    let remaining = item.quantity
    for (const reservation of reservations) {
      if (remaining <= 0) break
      const released = await tx.inventoryMovement.aggregate({ _sum: { quantity: true }, where: { inventoryId: reservation.inventoryId, referenceId: order.orderNumber, type: InventoryMovementType.SALE_RELEASE } })
      const fulfilled = await tx.inventoryMovement.aggregate({ _sum: { quantity: true }, where: { inventoryId: reservation.inventoryId, referenceId: order.orderNumber, type: InventoryMovementType.SALE_FULFILLMENT } })
      const availableReserved = Math.max(0, reservation.quantity - (released._sum.quantity ?? 0) - (fulfilled._sum.quantity ?? 0))
      const qty = Math.min(remaining, availableReserved)
      if (!qty) continue
      await tx.inventoryItem.update({ where: { id: reservation.inventoryId }, data: { quantity: { decrement: qty }, reserved: { decrement: qty } } })
      await tx.inventoryMovement.create({ data: { inventoryId: reservation.inventoryId, type: InventoryMovementType.SALE_FULFILLMENT, quantity: qty, reason: 'Order fulfilled', referenceId: order.orderNumber } })
      remaining -= qty
    }
    if (remaining > 0) throw new Error(`Unable to fulfill stock for ${item.name}`)
  }
}
