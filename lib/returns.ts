import { db } from '@/lib/prisma'
import { getPaymentProvider } from '@/lib/payments'
import { audit } from '@/lib/audit'

// Extended (Accelerate) client payload inference doesn't always widen nested `include`
// relations correctly, so query results are asserted to the shape actually queried.
export type ReturnOrderItem = { id: string; name: string; productId: string; variantId: string | null; quantity: number }
export type ReturnOrderPaymentTransaction = { id: string; status: string; amount: number; provider: string; externalId: string | null; createdAt: Date }
export type ReturnableOrder = {
  id: string; orderNumber: string; userId: string | null; status: string; paymentStatus: string
  grandTotal: number; currency: string; updatedAt: Date
  items: ReturnOrderItem[]; paymentTransactions: ReturnOrderPaymentTransaction[]
}

// Sums quantities already claimed by any non-terminal return request (REQUESTED counts too,
// so a second request can't over-claim the same item while the first is still pending) plus
// quantities already physically restocked via a RETURN inventory movement.
export async function alreadyReturnedQuantities(tx: any, orderId: string, orderNumber: string): Promise<Map<string, number>> {
  const previousReturns = (await tx.returnRequest.findMany({ where: { orderId, status: { notIn: ['REJECTED', 'CANCELLED'] } }, include: { items: true } })) as unknown as { items: { orderItemId: string; quantity: number }[] }[]
  const alreadyReturned = new Map<string, number>()
  for (const previous of previousReturns) for (const item of previous.items) alreadyReturned.set(item.orderItemId, (alreadyReturned.get(item.orderItemId) || 0) + Math.max(0, item.quantity))
  const movementRows = await tx.inventoryMovement.findMany({ where: { referenceId: orderNumber, type: 'RETURN' } })
  for (const movement of movementRows) {
    const match = movement.reason?.match(/^Customer return ([^:]+):/)
    if (match) alreadyReturned.set(match[1], (alreadyReturned.get(match[1]) || 0) + Math.max(0, movement.quantity))
  }
  return alreadyReturned
}

// Validates a raw {orderItemId, quantity} list against what the order actually contains and
// what's already spoken for, deduping repeated lines for the same item.
export function normalizeReturnItems(order: ReturnableOrder, inputItems: unknown[], alreadyReturned: Map<string, number>) {
  const orderItemById = new Map(order.items.map(item => [item.id, item]))
  const requestedQuantities = new Map<string, number>()
  for (const raw of inputItems as any[]) {
    const orderItemId = String(raw?.orderItemId || '').trim()
    const quantity = Number(raw?.quantity)
    const item = orderItemById.get(orderItemId)
    if (!item) throw new Error(`Order item ${orderItemId} was not found`)
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid return quantity for ${item.name}`)
    const totalRequested = (requestedQuantities.get(orderItemId) || 0) + quantity
    if (totalRequested + (alreadyReturned.get(orderItemId) || 0) > item.quantity) throw new Error(`Return quantity for ${item.name} exceeds the quantity purchased`)
    requestedQuantities.set(orderItemId, totalRequested)
  }
  const normalized: Array<{ orderItemId: string; quantity: number; item: ReturnOrderItem }> = []
  for (const [orderItemId, quantity] of requestedQuantities) normalized.push({ orderItemId, quantity, item: orderItemById.get(orderItemId)! })
  if (!normalized.length) throw new Error('At least one return item is required')
  return normalized
}

export function remainingRefundable(order: ReturnableOrder) {
  const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
  return Math.max(0, order.grandTotal - refunded)
}

export async function restockReturnEntries(tx: any, entries: Array<{ orderItemId: string; quantity: number; item: ReturnOrderItem }>, orderNumber: string, reasonText: string) {
  const restockedInventoryIds = new Set<string>()
  for (const entry of entries) {
    const dedicated = await tx.inventoryItem.findMany({ where: { productId: entry.item.productId, variantId: entry.item.variantId || null }, orderBy: { id: 'asc' } })
    const shared = entry.item.variantId ? await tx.inventoryItem.findMany({ where: { productId: entry.item.productId, variantId: null }, orderBy: { id: 'asc' } }) : []
    const rows = dedicated.length ? dedicated : shared
    if (!rows.length) throw new Error(`No inventory row exists for ${entry.item.name}`)
    let remaining = entry.quantity
    for (const row of rows) {
      if (remaining <= 0) break
      const add = remaining
      await tx.inventoryItem.update({ where: { id: row.id }, data: { quantity: { increment: add } } })
      restockedInventoryIds.add(row.id)
      await tx.inventoryMovement.create({ data: { inventoryId: row.id, type: 'RETURN', quantity: add, reason: `Customer return ${entry.orderItemId}: ${reasonText.slice(0, 1000)}`, referenceId: orderNumber } })
      remaining -= add
    }
    if (remaining > 0) throw new Error(`Unable to restock ${entry.item.name}`)
  }
  return restockedInventoryIds
}

// Picks the most recent non-manual captured/authorized/paid transaction to refund against,
// mirroring how the original direct-return flow chose a refund target.
export function pickRefundSource(order: ReturnableOrder) {
  const original = order.paymentTransactions.filter(t => t.provider !== 'manual' && ['paid', 'captured', 'authorized'].includes(t.status) && t.externalId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  return { refundProvider: original?.provider || 'manual', refundExternalId: original?.externalId || null }
}

// Post-commit gateway refund step, shared by every path that can issue a return refund. Never
// throws -- on gateway failure it marks the refund transaction failed and returns ok: false so
// the caller can report a 502 without rolling back the already-committed restock/return record.
export async function settleReturnRefund(actorId: string, params: { returnId: string; orderId: string; refundId: string; refundProvider: string; refundExternalId: string | null; amount: number; currency: string }) {
  const { returnId, orderId, refundId, refundProvider, refundExternalId, amount, currency } = params
  if (refundProvider === 'manual') return { ok: true as const }
  try {
    if (!refundExternalId) throw new Error('Paid gateway transaction is missing its external reference')
    const provider = await getPaymentProvider(refundProvider)
    if (provider.name !== refundProvider || !provider.refundPayment) throw new Error(`Payment provider ${refundProvider} is not available for refunds`)
    const gatewayResult = await provider.refundPayment(refundExternalId, amount, currency)
    if (gatewayResult === 'refunded') {
      await db.$transaction(async tx => {
        await tx.paymentTransaction.update({ where: { id: refundId }, data: { status: 'refunded' } })
        await tx.returnRequest.update({ where: { id: returnId }, data: { status: 'REFUNDED', refundedAt: new Date() } })
        const orderRow = await tx.order.findUnique({ where: { id: orderId }, include: { paymentTransactions: true } })
        if (!orderRow) throw new Error('Order not found')
        const successfulRefunds = orderRow.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
        const paymentStatus = successfulRefunds >= orderRow.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
        await tx.order.update({ where: { id: orderRow.id }, data: { paymentStatus, status: paymentStatus === 'REFUNDED' ? 'REFUNDED' : orderRow.status } })
        await tx.auditLog.create({ data: { actorId, action: 'order.return_refund_completed', entity: 'Order', entityId: orderRow.id, metadataJson: JSON.stringify({ returnId, refundId, amount, provider: refundProvider }) } })
      })
      return { ok: true as const }
    }
    await audit(actorId, 'order.return_refund_pending', 'Order', orderId, { returnId, refundId, amount, provider: refundProvider })
    return { ok: true as const }
  } catch (error) {
    await db.paymentTransaction.update({ where: { id: refundId }, data: { status: 'refund_failed', rawJson: JSON.stringify({ returnId, error: error instanceof Error ? error.message : 'Gateway refund failed' }).slice(0, 5000) } })
    await audit(actorId, 'order.return_refund_failed', 'Order', orderId, { returnId, refundId, provider: refundProvider })
    return { ok: false as const }
  }
}
