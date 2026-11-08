// Returns at the till. A return is recorded against the original receipt, the stock is put back only
// when the item is sellable, and the refund is recorded against the cashier's shift.
// Two returns of the same receipt are serialised by locking the order row, so the returned quantity
// can never go past what was bought.

import { PaymentLineMethod, PaymentStatus, ReturnStatus } from '@prisma/client'
import { db, runInteractiveTransaction } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export class ReturnError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReturnError'
  }
}

export const RETURN_CONDITIONS = ['SELLABLE', 'DAMAGED'] as const
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number]
const REFUND_METHODS = Object.values(PaymentLineMethod)
// Returns that were rejected or cancelled do not count against the receipt.
const COUNTED = { notIn: [ReturnStatus.REJECTED, ReturnStatus.CANCELLED] }

export type ReceiptForReturn = {
  orderId: string
  orderNumber: string
  createdAt: Date
  grandTotal: number
  subtotal: number
  locationName: string
  items: Array<{ orderItemId: string; name: string; sku: string; unitPrice: number; quantity: number; returnable: number }>
}

/** A till receipt with how many units of each line can still be returned. */
export async function findReceiptForReturn(receiptNumber: string): Promise<ReceiptForReturn | null> {
  const order = await db.order.findUnique({
    where: { orderNumber: receiptNumber },
    include: { items: true, location: { select: { name: true } } },
  })
  if (!order || order.channel !== 'POS') return null
  const returned = await db.returnItem.groupBy({
    by: ['orderItemId'],
    where: { returnRequest: { orderId: order.id, status: COUNTED } },
    _sum: { quantity: true },
  })
  const returnedByLine = new Map(returned.map(row => [row.orderItemId, row._sum.quantity ?? 0]))
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    grandTotal: order.grandTotal,
    subtotal: order.subtotal,
    locationName: order.location?.name ?? '',
    items: order.items.map(item => ({
      orderItemId: item.id,
      name: item.name,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      returnable: Math.max(0, item.quantity - (returnedByLine.get(item.id) ?? 0)),
    })),
  }
}

export type ReturnLineInput = { orderItemId: unknown; quantity: unknown; condition: unknown }

export type ReturnInput = {
  receiptNumber: unknown
  reason: unknown
  refundMethod: unknown
  lines: ReturnLineInput[]
}

export type ReturnResult = {
  returnId: string
  refundCents: number
  restocked: number
  refundMethod: PaymentLineMethod
  orderNumber: string
}

/**
 * Records a return for the cashier's open shift. The refund is the price paid for the returned units,
 * with the receipt's discount shared out in proportion. A sellable unit goes back into stock at the
 * order's location; a damaged unit is recorded on the return but does not add to stock.
 */
export async function recordPosReturn(input: ReturnInput, cashierId: string): Promise<ReturnResult> {
  const receiptNumber = typeof input.receiptNumber === 'string' ? input.receiptNumber.trim() : ''
  if (!receiptNumber) throw new ReturnError('Enter the receipt number.')
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (reason.length < 3 || reason.length > 200) throw new ReturnError('Write the reason for the return (3 to 200 characters).')
  const method = input.refundMethod as PaymentLineMethod
  if (!REFUND_METHODS.includes(method)) throw new ReturnError('Choose how the money goes back.')
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new ReturnError('Choose at least one item to return.')
  if (input.lines.length > 100) throw new ReturnError('Too many lines in one return.')
  for (const line of input.lines) {
    if (typeof line.orderItemId !== 'string' || !line.orderItemId) throw new ReturnError('An item on the return is not valid.')
    if (!Number.isInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > 999) throw new ReturnError('Each quantity must be a whole number, 1 or more.')
    if (!RETURN_CONDITIONS.includes(line.condition as ReturnCondition)) throw new ReturnError('Say whether each item is sellable or damaged.')
  }

  const result = await runInteractiveTransaction(db, async tx => {
    const found = await tx.order.findFirst({ where: { orderNumber: receiptNumber, channel: 'POS' }, select: { id: true } })
    if (!found) throw new ReturnError('No till receipt has that number.')
    // Serialise returns on this receipt: the second return waits here and sees the first one's quantities.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${found.id} FOR UPDATE`
    const order = await tx.order.findUnique({ where: { id: found.id }, include: { items: true } })

    const shift = await tx.cashierShift.findFirst({ where: { cashierId, status: 'OPEN' }, select: { id: true } })
    if (!shift) throw new ReturnError('Open a cashier shift before recording a return.')

    const returned = await tx.returnItem.groupBy({
      by: ['orderItemId'],
      where: { returnRequest: { orderId: order.id, status: COUNTED } },
      _sum: { quantity: true },
    })
    const returnedByLine = new Map<string, number>(returned.map((row: { orderItemId: string; _sum: { quantity: number | null } }) => [row.orderItemId, row._sum.quantity ?? 0]))

    const lines = input.lines.map(line => {
      const item = order.items.find((x: { id: string }) => x.id === line.orderItemId)
      if (!item) throw new ReturnError('An item on the return is not on this receipt.')
      const quantity = line.quantity as number
      const left = item.quantity - (returnedByLine.get(item.id) ?? 0)
      if (quantity > left) throw new ReturnError(`${item.name}: only ${left} can still be returned.`)
      return { item, quantity, condition: line.condition as ReturnCondition }
    })

    // The refund shares out the discount: a 10% discount on the receipt refunds 90% of each line.
    const linesCents = lines.reduce((sum, line) => sum + line.quantity * line.item.unitPrice, 0)
    const refundCents = order.subtotal > 0 ? Math.round((linesCents * order.grandTotal) / order.subtotal) : 0

    const returnRequest = await tx.returnRequest.create({
      data: {
        orderId: order.id,
        status: ReturnStatus.REFUNDED,
        reason,
        refundAmount: refundCents,
        restock: lines.some(line => line.condition === 'SELLABLE'),
        receivedAt: new Date(),
        refundedAt: new Date(),
        shiftId: shift.id,
        cashierId,
        refundMethod: method,
        items: {
          create: await Promise.all(lines.map(async line => {
            const variant = await tx.productVariant.findFirst({ where: { productId: line.item.productId, sku: line.item.sku }, select: { id: true } })
            return { orderItemId: line.item.id, productId: line.item.productId, variantId: variant?.id ?? null, quantity: line.quantity, condition: line.condition }
          })),
        },
      },
      select: { id: true },
    })

    let restocked = 0
    for (const line of lines) {
      if (line.condition !== 'SELLABLE') continue
      const variant = await tx.productVariant.findFirst({ where: { productId: line.item.productId, sku: line.item.sku }, select: { id: true } })
      const variantId = variant?.id ?? null
      let row = await tx.inventoryItem.findFirst({ where: { productId: line.item.productId, variantId, locationId: order.locationId } })
      if (!row) {
        row = await tx.inventoryItem.create({ data: { productId: line.item.productId, variantId, locationId: order.locationId, quantity: 0, reserved: 0 } })
      }
      await tx.inventoryItem.update({ where: { id: row.id }, data: { quantity: { increment: line.quantity } } })
      await tx.inventoryMovement.create({
        data: { inventoryId: row.id, type: 'RETURN', quantity: line.quantity, reason: `Till return: ${reason}`, referenceId: order.orderNumber },
      })
      restocked += line.quantity
    }

    // Payment status follows the total refunded so far on this receipt.
    const refunds = await tx.returnRequest.aggregate({ where: { orderId: order.id, status: ReturnStatus.REFUNDED }, _sum: { refundAmount: true } })
    const totalRefunded = refunds._sum.refundAmount ?? 0
    const fullyReturned = order.items.every((item: { id: string; quantity: number }) => (returnedByLine.get(item.id) ?? 0) + (lines.find(line => line.item.id === item.id)?.quantity ?? 0) >= item.quantity)
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: totalRefunded >= order.grandTotal || fullyReturned ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED },
    })

    return { returnId: returnRequest.id, refundCents, restocked, refundMethod: method, orderNumber: order.orderNumber, orderId: order.id, shiftId: shift.id }
  }, { atomic: true })

  await audit(cashierId, 'pos.return', 'ReturnRequest', result.returnId, { orderNumber: result.orderNumber, refundCents: result.refundCents, refundMethod: result.refundMethod, restocked: result.restocked })
  return { returnId: result.returnId, refundCents: result.refundCents, restocked: result.restocked, refundMethod: result.refundMethod, orderNumber: result.orderNumber }
}
