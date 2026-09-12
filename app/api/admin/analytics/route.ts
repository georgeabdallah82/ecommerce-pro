import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

type Bucket = { revenue: number; orders: number; items: number; newCustomers: number }
type Range = { since: Date; until: Date; days: number }

function parseDateParam(value: string | null) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function clampDays(value: string | null, fallback: number) {
  const n = Number(value || fallback)
  return Number.isFinite(n) ? Math.min(365, Math.max(1, Math.floor(n))) : fallback
}

/**
 * Resolves the current-period range from either a custom start/end pair or a
 * rolling day count, then derives the comparison range from compareMode --
 * previous_period sits immediately before the current range (same length),
 * previous_year is the same day-span exactly 365 days earlier so the two
 * series line up bucket-for-bucket regardless of range length.
 *
 * Every range boundary is snapped to a UTC calendar-day edge (never `now`'s
 * raw time-of-day). Anchoring `since` at `now - days*ms` instead would make
 * "last 7 days" span parts of 8 distinct calendar dates whenever `now` isn't
 * exactly midnight -- and cut off "today" entirely, since its last bucket
 * would land one day short of `now`'s own calendar date.
 */
function resolveRanges(searchParams: URLSearchParams, now: Date): { current: Range; previous: Range | null } {
  const startParam = parseDateParam(searchParams.get('start'))
  const endParam = parseDateParam(searchParams.get('end'))
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const tomorrowStart = new Date(todayStart.getTime() + 86400000)

  let current: Range
  if (startParam && endParam && endParam >= startParam) {
    const until = new Date(Math.min(endParam.getTime() + 86400000, tomorrowStart.getTime()))
    const days = Math.max(1, Math.round((until.getTime() - startParam.getTime()) / 86400000))
    current = { since: startParam, until, days }
  } else {
    const days = clampDays(searchParams.get('days'), 30)
    current = { since: new Date(todayStart.getTime() - (days - 1) * 86400000), until: tomorrowStart, days }
  }

  const compareMode = searchParams.get('compareMode') || 'previous_period'
  if (compareMode === 'none') return { current, previous: null }
  if (compareMode === 'previous_year') {
    const yearMs = 365 * 86400000
    return { current, previous: { since: new Date(current.since.getTime() - yearMs), until: new Date(current.until.getTime() - yearMs), days: current.days } }
  }
  return { current, previous: { since: new Date(current.since.getTime() - current.days * 86400000), until: current.since, days: current.days } }
}

function bucketKey(date: Date, days: number) {
  return days > 90 ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` : date.toISOString().slice(0, 10)
}

function buildBuckets(range: Range) {
  const map = new Map<string, Bucket>()
  if (range.days <= 90) {
    for (let i = 0; i < range.days; i++) {
      const d = new Date(range.since.getTime() + i * 86400000)
      map.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0, items: 0, newCustomers: 0 })
    }
  } else {
    const start = new Date(Date.UTC(range.since.getUTCFullYear(), range.since.getUTCMonth(), 1))
    const months = Math.max(1, Math.round(range.days / 30))
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
      map.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, { revenue: 0, orders: 0, items: 0, newCustomers: 0 })
    }
  }
  return map
}

function netRevenueForOrder(order: { grandTotal: number; paymentTransactions: { status: string; amount: number }[] }) {
  const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
  return Math.max(0, order.grandTotal - refunded)
}

const pct = (value: number, prev: number) => (prev === 0 ? (value === 0 ? 0 : 100) : Math.round(((value - prev) / prev) * 100))

async function loadPeriod(range: Range) {
  const [orders, newCustomerRows] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: range.since, lt: range.until }, status: { not: OrderStatus.CANCELLED } },
      select: { createdAt: true, grandTotal: true, discountTotal: true, userId: true, items: { select: { productId: true, quantity: true, totalPrice: true, name: true } }, paymentTransactions: { select: { status: true, amount: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.user.findMany({ where: { role: 'CUSTOMER', createdAt: { gte: range.since, lt: range.until } }, select: { createdAt: true } }),
  ])

  const buckets = buildBuckets(range)
  let revenue = 0, itemsSold = 0, discountGiven = 0
  const orderingCustomers = new Set<string>()
  for (const o of orders) {
    const net = netRevenueForOrder(o)
    revenue += net
    discountGiven += o.discountTotal || 0
    const items = o.items.reduce((s, i) => s + i.quantity, 0)
    itemsSold += items
    if (o.userId) orderingCustomers.add(o.userId)
    const key = bucketKey(new Date(o.createdAt), range.days)
    const point = buckets.get(key)
    if (point) { point.orders += 1; point.revenue += net; point.items += items }
  }
  for (const c of newCustomerRows) {
    const key = bucketKey(new Date(c.createdAt), range.days)
    const point = buckets.get(key)
    if (point) point.newCustomers += 1
  }

  // Returning-customer rate: of the customers who ordered in this period, what
  // share had already placed at least one order before the period started.
  let returningCustomers = 0
  if (orderingCustomers.size) {
    const priorOrders = await db.order.findMany({ where: { userId: { in: [...orderingCustomers] }, createdAt: { lt: range.since }, status: { not: OrderStatus.CANCELLED } }, select: { userId: true }, distinct: ['userId'] })
    returningCustomers = priorOrders.length
  }

  const topProductsMap = new Map<string, { productId: string; name: string; quantity: number; sales: number }>()
  orders.forEach(o => o.items.forEach(i => {
    const existing = topProductsMap.get(i.productId) || { productId: i.productId, name: i.name, quantity: 0, sales: 0 }
    existing.quantity += i.quantity
    existing.sales += i.totalPrice
    topProductsMap.set(i.productId, existing)
  }))

  return {
    orderCount: orders.length,
    revenue,
    itemsSold,
    discountGiven,
    newCustomers: newCustomerRows.length,
    orderingCustomerCount: orderingCustomers.size,
    returningCustomers,
    series: Array.from(buckets, ([date, value]) => ({ date, ...value })),
    topProducts: Array.from(topProductsMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10),
  }
}

export async function GET(req: Request) {
  try {
    await requirePermission('reports.view')
    const { searchParams } = new URL(req.url)
    const now = new Date()
    const { current, previous } = resolveRanges(searchParams, now)

    const [currentPeriod, previousPeriod, inventory, products] = await Promise.all([
      loadPeriod(current),
      previous ? loadPeriod(previous) : null,
      db.inventoryItem.findMany({
        select: { id: true, quantity: true, reserved: true, lowStockThreshold: true, product: { select: { name: true, sku: true } }, variant: { select: { name: true, sku: true } } },
      }),
      db.product.count({}),
    ])

    const averageOrderValue = currentPeriod.orderCount ? Math.round(currentPeriod.revenue / currentPeriod.orderCount) : 0
    const previousAverageOrderValue = previousPeriod?.orderCount ? Math.round(previousPeriod.revenue / previousPeriod.orderCount) : 0
    const returningCustomerRate = currentPeriod.orderingCustomerCount ? Math.round((currentPeriod.returningCustomers / currentPeriod.orderingCustomerCount) * 100) : 0
    const previousReturningCustomerRate = previousPeriod?.orderingCustomerCount ? Math.round((previousPeriod.returningCustomers / previousPeriod.orderingCustomerCount) * 100) : 0

    const lowStock = inventory
      .filter(i => i.quantity - i.reserved <= i.lowStockThreshold)
      .map(i => ({ id: i.id, product: i.product.name, sku: i.variant?.sku ?? i.product.sku, variant: i.variant?.name ?? null, available: Math.max(0, i.quantity - i.reserved), threshold: i.lowStockThreshold }))
      .sort((a, b) => a.available - b.available)
      .slice(0, 12)

    return json({
      periodDays: current.days,
      granularity: current.days > 90 ? 'month' : 'day',
      range: { since: current.since.toISOString(), until: current.until.toISOString() },
      compareRange: previous ? { since: previous.since.toISOString(), until: previous.until.toISOString() } : null,
      kpis: {
        revenue: currentPeriod.revenue,
        previousRevenue: previousPeriod?.revenue ?? null,
        revenueChange: previousPeriod ? pct(currentPeriod.revenue, previousPeriod.revenue) : null,
        orders: currentPeriod.orderCount,
        ordersChange: previousPeriod ? pct(currentPeriod.orderCount, previousPeriod.orderCount) : null,
        averageOrderValue,
        averageOrderValueChange: previousPeriod ? pct(averageOrderValue, previousAverageOrderValue) : null,
        itemsSold: currentPeriod.itemsSold,
        itemsSoldChange: previousPeriod ? pct(currentPeriod.itemsSold, previousPeriod.itemsSold) : null,
        newCustomers: currentPeriod.newCustomers,
        newCustomersChange: previousPeriod ? pct(currentPeriod.newCustomers, previousPeriod.newCustomers) : null,
        returningCustomerRate,
        returningCustomerRateChange: previousPeriod ? pct(returningCustomerRate, previousReturningCustomerRate) : null,
        discountGiven: currentPeriod.discountGiven,
        products,
      },
      series: currentPeriod.series,
      previousSeries: previousPeriod?.series ?? null,
      topProducts: currentPeriod.topProducts,
      lowStock,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[admin/analytics] unexpected failure', error)
    return json({ error: 'Unable to load analytics' }, { status: 500 })
  }
}
