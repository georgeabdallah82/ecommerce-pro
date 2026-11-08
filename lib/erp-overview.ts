// Business numbers for the ERP overview. Every figure comes from database records.
// Revenue, cost and profit are kept apart. Cost is copied onto each sold item when it is sold, so
// profit only counts items that have a cost recorded; the coverage figure says how much that is.

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

export type ProfitLine = { quantity: number; totalPrice: number; costPrice: number | null; ratio: number }

/**
 * Revenue, cost and profit for the lines that have a cost recorded. `quantity` and `totalPrice` are
 * already net of returns; `ratio` is the share of the list price the customer paid (after discount).
 * Lines without a cost are counted as revenue only, so profit is never inflated by missing costs.
 */
export function profitFromLines(lines: ProfitLine[]) {
  let costedRevenueCents = 0
  let uncostedRevenueCents = 0
  let costCents = 0
  for (const line of lines) {
    const revenue = Math.round(line.totalPrice * line.ratio)
    if (line.costPrice === null) {
      uncostedRevenueCents += revenue
      continue
    }
    costedRevenueCents += revenue
    costCents += line.quantity * line.costPrice
  }
  const revenueCents = costedRevenueCents + uncostedRevenueCents
  return {
    revenueCents,
    costedRevenueCents,
    costCents,
    profitCents: costedRevenueCents - costCents,
    coveragePct: revenueCents > 0 ? Math.round((costedRevenueCents / revenueCents) * 100) : null,
  }
}

/** Profit from items sold since `from` (or ever), net of units returned at the till or online. */
export async function profitSince(from: Date | null) {
  const items = await db.orderItem.findMany({
    where: { order: { status: { notIn: NOT_SOLD }, ...(from ? { createdAt: { gte: from } } : {}) } },
    select: { id: true, quantity: true, unitPrice: true, costPrice: true, order: { select: { grandTotal: true, subtotal: true } } },
  })
  if (items.length === 0) return profitFromLines([])
  const returned = await db.returnItem.groupBy({
    by: ['orderItemId'],
    where: { orderItemId: { in: items.map(item => item.id) }, returnRequest: { status: ReturnStatus.REFUNDED } },
    _sum: { quantity: true },
  })
  const returnedByItem = new Map(returned.map(row => [row.orderItemId, row._sum.quantity ?? 0]))
  const lines: ProfitLine[] = []
  for (const item of items) {
    const netQuantity = Math.max(0, item.quantity - (returnedByItem.get(item.id) ?? 0))
    if (netQuantity === 0) continue
    const ratio = item.order.subtotal > 0 ? item.order.grandTotal / item.order.subtotal : 1
    lines.push({ quantity: netQuantity, totalPrice: item.unitPrice * netQuantity, costPrice: item.costPrice, ratio })
  }
  return profitFromLines(lines)
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
  const [profitAllTime, profitMonth] = await Promise.all([profitSince(null), profitSince(startOfStoreMonth(now, timezone))])
  return {
    allTime,
    month,
    profit: { allTime: profitAllTime, month: profitMonth },
    onlineOrders: channelCount('ONLINE'),
    posOrders: channelCount('POS'),
    products,
    stock,
    pendingPurchases,
    movements,
    posSales,
  }
}
