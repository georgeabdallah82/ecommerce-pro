// Business numbers for the ERP overview. Every figure comes from database records.
// Revenue, cost and profit are kept apart: profit is not shown, because a sale does not yet record
// the cost of what it sold (docs/erp-pos-architecture.md), so an estimate would be a guess.

import { OrderStatus, PurchaseOrderStatus, ReturnStatus } from '@prisma/client'
import { db } from '@/lib/prisma'

export type StockRow = { productId: string; quantity: number; reserved: number; costPrice: number | null }

/** Out-of-stock products and the value of stock on hand, from the stock rows. Pure. */
export function stockOverview(rows: StockRow[]) {
  const byProduct = new Map<string, { available: number; valueCents: number; missingCost: boolean }>()
  for (const row of rows) {
    const entry = byProduct.get(row.productId) ?? { available: 0, valueCents: 0, missingCost: false }
    entry.available += Math.max(0, row.quantity - row.reserved)
    if (row.quantity > 0) {
      if (row.costPrice === null) entry.missingCost = true
      else entry.valueCents += row.quantity * row.costPrice
    }
    byProduct.set(row.productId, entry)
  }
  let outOfStock = 0
  let valuationCents = 0
  let productsWithoutCost = 0
  for (const entry of byProduct.values()) {
    if (entry.available <= 0) outOfStock++
    valuationCents += entry.valueCents
    if (entry.missingCost) productsWithoutCost++
  }
  return { trackedProducts: byProduct.size, outOfStock, valuationCents, productsWithoutCost }
}

const NOT_SOLD = [OrderStatus.CANCELLED, OrderStatus.REFUNDED]
const REFUNDED_PAYMENTS = ['refunded', 'partially_refunded']
const OPEN_PURCHASES = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED]

/** Sales from `from` onwards, net of refunds: revenue, refunds and what is left. */
export async function salesSince(from: Date | null) {
  const where = { status: { notIn: NOT_SOLD }, ...(from ? { createdAt: { gte: from } } : {}) }
  const [revenue, refunds, tillRefunds] = await Promise.all([
    db.order.aggregate({ where, _sum: { grandTotal: true }, _count: { _all: true } }),
    db.paymentTransaction.aggregate({
      where: { status: { in: REFUNDED_PAYMENTS }, order: { createdAt: from ? { gte: from } : undefined } },
      _sum: { amount: true },
    }),
    // Refunds made at the till (lib/pos-returns.ts), dated by when they were refunded.
    db.returnRequest.aggregate({ where: { status: ReturnStatus.REFUNDED, refundedAt: from ? { gte: from } : undefined }, _sum: { refundAmount: true } }),
  ])
  const revenueCents = revenue._sum.grandTotal ?? 0
  const refundCents = (refunds._sum.amount ?? 0) + (tillRefunds._sum.refundAmount ?? 0)
  return { revenueCents, refundCents, netCents: Math.max(0, revenueCents - refundCents), orders: revenue._count._all }
}

/**
 * Midnight at the start of the month `now` falls in, in the store's timezone. Daylight-saving
 * changes can move the boundary by an hour; that is accepted for a monthly total.
 */
export function startOfStoreMonth(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(now)
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  const secondsIntoDay = pick('hour') * 3600 + pick('minute') * 60 + pick('second')
  const dayOfMonth = pick('day')
  const DAY = 24 * 60 * 60 * 1000
  return new Date(now.getTime() - secondsIntoDay * 1000 - (dayOfMonth - 1) * DAY)
}

export async function loadErpOverview(now: Date, timezone: string) {
  const [allTime, month, channels, products, stockRows, pendingPurchases, movements, posSales] = await Promise.all([
    salesSince(null),
    salesSince(startOfStoreMonth(now, timezone)),
    db.order.groupBy({ by: ['channel'], _count: { _all: true } }),
    db.product.count({ where: { status: { not: 'ARCHIVED' } } }),
    db.inventoryItem.findMany({
      where: { product: { trackInventory: true } },
      select: { productId: true, quantity: true, reserved: true, product: { select: { costPrice: true } } },
    }),
    db.purchaseOrder.count({ where: { status: { in: OPEN_PURCHASES } } }),
    db.inventoryMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { type: true, quantity: true, reason: true, referenceId: true, createdAt: true, inventory: { select: { product: { select: { name: true } } } } },
    }),
    db.order.findMany({
      where: { channel: 'POS' },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { orderNumber: true, grandTotal: true, createdAt: true, cashier: { select: { name: true } } },
    }),
  ])

  const channelCount = (channel: string) => channels.find(row => row.channel === channel)?._count._all ?? 0
  const stock = stockOverview(stockRows.map(row => ({ productId: row.productId, quantity: row.quantity, reserved: row.reserved, costPrice: row.product.costPrice })))
  return {
    allTime,
    month,
    onlineOrders: channelCount('ONLINE'),
    posOrders: channelCount('POS'),
    products,
    stock,
    pendingPurchases,
    movements,
    posSales,
  }
}
