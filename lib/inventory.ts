import { InventoryMovementType } from '@prisma/client'

type ReservationMovement = {
  inventoryId: string
  quantity: number
}

type InventoryMovementRow = {
  inventoryId: string
  quantity: number
}

type InventoryAllocationRow = {
  id: string
  productId: string
  variantId: string | null
}

export function availableQuantity(row: { quantity: number; reserved: number }) {
  return Math.max(0, row.quantity - row.reserved)
}

export async function reserveStock(tx: any, product: any, variantId: string | null | undefined, quantity: number, referenceId: string) {
  if (quantity <= 0) throw new Error('Quantity must be greater than zero')
  if (!product.trackInventory || product.continueSellingWhenOutOfStock) return []

  const variantRows = variantId ? product.inventory.filter((x: any) => x.variantId === variantId) : []
  const rows = variantRows.length > 0 ? variantRows : product.inventory.filter((x: any) => !x.variantId)

  let remaining = quantity
  const reservations: Array<{ inventoryId: string; quantity: number }> = []
  for (const row of rows) {
    if (remaining <= 0) break
    const canReserve = Math.min(remaining, availableQuantity(row))
    if (canReserve <= 0) continue

    const affected = await tx.inventoryItem.updateMany({
      where: { id: row.id, reserved: { lte: row.quantity - canReserve } },
      data: { reserved: { increment: canReserve } },
    })
    if (affected.count !== 1) continue

    await tx.inventoryMovement.create({
      data: {
        inventoryId: row.id,
        type: InventoryMovementType.SALE_RESERVATION,
        quantity: canReserve,
        reason: 'Checkout reservation',
        referenceId,
      },
    })
    reservations.push({ inventoryId: row.id, quantity: canReserve })
    remaining -= canReserve
  }

  if (remaining > 0) throw new Error(`Not enough stock for ${product.name}`)
  return reservations
}

export async function releaseOrderReservations(tx: any, orderId: string, reason = 'Order reservation released') {
  const order = await tx.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  const reservations = (await tx.inventoryMovement.findMany({
    where: { type: InventoryMovementType.SALE_RESERVATION, referenceId: order.orderNumber },
    orderBy: { createdAt: 'asc' },
  })) as ReservationMovement[]

  for (const reservation of reservations) {
    const [released, fulfilled] = await Promise.all([
      tx.inventoryMovement.aggregate({
        _sum: { quantity: true },
        where: { inventoryId: reservation.inventoryId, referenceId: order.orderNumber, type: InventoryMovementType.SALE_RELEASE },
      }),
      tx.inventoryMovement.aggregate({
        _sum: { quantity: true },
        where: { inventoryId: reservation.inventoryId, referenceId: order.orderNumber, type: InventoryMovementType.SALE_FULFILLMENT },
      }),
    ])

    const remaining = Math.max(0, reservation.quantity - (released._sum.quantity ?? 0) - (fulfilled._sum.quantity ?? 0))
    if (!remaining) continue

    const updated = await tx.inventoryItem.updateMany({
      where: { id: reservation.inventoryId, reserved: { gte: remaining } },
      data: { reserved: { decrement: remaining } },
    })
    if (updated.count !== 1) {
      throw new Error(`Unable to release reserved stock for order ${order.orderNumber}`)
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryId: reservation.inventoryId,
        type: InventoryMovementType.SALE_RELEASE,
        quantity: remaining,
        reason,
        referenceId: order.orderNumber,
      },
    })
  }
}

export async function fulfillOrderStock(tx: any, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } })
  if (!order) throw new Error('Order not found')

  const reservations = (await tx.inventoryMovement.findMany({
    where: { referenceId: order.orderNumber, type: InventoryMovementType.SALE_RESERVATION },
    orderBy: { createdAt: 'asc' },
  })) as ReservationMovement[]

  const [releasedRows, fulfilledRows] = (await Promise.all([
    tx.inventoryMovement.findMany({
      where: { referenceId: order.orderNumber, type: InventoryMovementType.SALE_RELEASE },
      select: { inventoryId: true, quantity: true },
    }),
    tx.inventoryMovement.findMany({
      where: { referenceId: order.orderNumber, type: InventoryMovementType.SALE_FULFILLMENT },
      select: { inventoryId: true, quantity: true },
    }),
  ])) as [InventoryMovementRow[], InventoryMovementRow[]]

  const releasedByInventory = new Map<string, number>()
  for (const row of releasedRows) releasedByInventory.set(row.inventoryId, (releasedByInventory.get(row.inventoryId) ?? 0) + row.quantity)

  const fulfilledByInventory = new Map<string, number>()
  for (const row of fulfilledRows) fulfilledByInventory.set(row.inventoryId, (fulfilledByInventory.get(row.inventoryId) ?? 0) + row.quantity)

  const remainingReservationByInventory = new Map<string, number>()
  for (const reservation of reservations) {
    const remaining = Math.max(0, reservation.quantity - (releasedByInventory.get(reservation.inventoryId) ?? 0) - (fulfilledByInventory.get(reservation.inventoryId) ?? 0))
    if (remaining > 0) remainingReservationByInventory.set(reservation.inventoryId, (remainingReservationByInventory.get(reservation.inventoryId) ?? 0) + remaining)
  }

  const inventoryRows = (await tx.inventoryItem.findMany({
    where: { id: { in: [...remainingReservationByInventory.keys()] } },
    select: { id: true, productId: true, variantId: true },
  })) as InventoryAllocationRow[]
  const inventoryById = new Map<string, InventoryAllocationRow>(inventoryRows.map(row => [row.id, row]))

  const demands = new Map<string, { productId: string; variantId: string | null; quantity: number; name: string }>()
  for (const item of order.items) {
    if (!item.product.trackInventory || item.product.continueSellingWhenOutOfStock) continue

    const dedicatedVariantRows = await tx.inventoryItem.count({ where: { productId: item.productId, variantId: item.variantId ?? undefined } })
    const usesDedicatedVariant = !!item.variantId && dedicatedVariantRows > 0
    const key = usesDedicatedVariant ? `${item.productId}:variant:${item.variantId}` : `${item.productId}:shared`
    const current = demands.get(key)
    if (current) current.quantity += item.quantity
    else demands.set(key, { productId: item.productId, variantId: usesDedicatedVariant ? item.variantId : null, quantity: item.quantity, name: item.name })
  }

  for (const demand of demands.values()) {
    const eligibleReservations = reservations.filter((reservation: ReservationMovement) => {
      const inventory = inventoryById.get(reservation.inventoryId)
      if (!inventory) return false
      if (demand.variantId) return inventory.productId === demand.productId && inventory.variantId === demand.variantId
      return inventory.productId === demand.productId && inventory.variantId === null
    })

    let remaining = demand.quantity
    for (const reservation of eligibleReservations) {
      if (remaining <= 0) break
      const availableReserved = remainingReservationByInventory.get(reservation.inventoryId) ?? 0
      const qty = Math.min(remaining, availableReserved)
      if (!qty) continue

      const updated = await tx.inventoryItem.updateMany({
        where: { id: reservation.inventoryId, quantity: { gte: qty }, reserved: { gte: qty } },
        data: { quantity: { decrement: qty }, reserved: { decrement: qty } },
      })
      if (updated.count !== 1) throw new Error(`Unable to fulfill stock for ${demand.name}`)

      await tx.inventoryMovement.create({
        data: {
          inventoryId: reservation.inventoryId,
          type: InventoryMovementType.SALE_FULFILLMENT,
          quantity: qty,
          reason: 'Order fulfilled',
          referenceId: order.orderNumber,
        },
      })
      remainingReservationByInventory.set(reservation.inventoryId, availableReserved - qty)
      remaining -= qty
    }

    if (remaining > 0) throw new Error(`Unable to fulfill stock for ${demand.name}`)
  }
}
