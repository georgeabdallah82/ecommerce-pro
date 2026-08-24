import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

function clampDays(value: string | null, fallback: number) {
  const n = Number(value || fallback)
  return Number.isFinite(n) ? Math.min(365, Math.max(1, Math.floor(n))) : fallback
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  try {
    await requirePermission('reports.view')
    const { searchParams } = new URL(req.url)
    const days = clampDays(searchParams.get('days'), 30)
    const compare = clampDays(searchParams.get('compare'), days)
    const now = new Date()
    const since = new Date(now.getTime() - days * 86400000)
    const compareSince = new Date(since.getTime() - compare * 86400000)

    const [currentOrders, previousOrders, customers, inventory, products] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since }, status: { not: OrderStatus.CANCELLED } },
        select: { id: true, createdAt: true, grandTotal: true, items: { select: { productId: true, quantity: true, totalPrice: true, name: true } }, paymentTransactions: { select: { status: true, amount: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.order.findMany({
        where: { createdAt: { gte: compareSince, lt: since }, status: { not: OrderStatus.CANCELLED } },
        select: { grandTotal: true, paymentTransactions: { select: { status: true, amount: true } } },
      }),
      db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: since } } }),
      db.inventoryItem.findMany({ include: { product: { select: { id: true, name: true, sku: true } }, variant: { select: { name: true, sku: true } } } }),
      db.product.count({}),
    ])

    const netRevenue = (orders: typeof currentOrders) => orders.reduce((sum, o) => {
      const refunded = o.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((s, t) => s + t.amount, 0)
      return sum + Math.max(0, o.grandTotal - refunded)
    }, 0)
    const revenue = netRevenue(currentOrders)
    const previousRevenue = netRevenue(previousOrders as any)
    const itemsSold = currentOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)
    const averageOrderValue = currentOrders.length ? Math.round(revenue / currentOrders.length) : 0
    const pct = (value: number, prev: number) => prev === 0 ? (value === 0 ? 0 : 100) : Math.round(((value - prev) / prev) * 100)

    const seriesMap = new Map<string, { revenue: number; orders: number }>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      seriesMap.set(dayKey(d), { revenue: 0, orders: 0 })
    }
    currentOrders.forEach(o => {
      const key = dayKey(new Date(o.createdAt))
      const point = seriesMap.get(key)
      if (point) { point.orders += 1; point.revenue += o.grandTotal }
    })

    const topProductsMap = new Map<string, { productId: string; name: string; quantity: number; sales: number }>()
    currentOrders.forEach(o => o.items.forEach(i => {
      const existing = topProductsMap.get(i.productId) || { productId: i.productId, name: i.name, quantity: 0, sales: 0 }
      existing.quantity += i.quantity
      existing.sales += i.totalPrice
      topProductsMap.set(i.productId, existing)
    }))

    const lowStock = inventory.filter(i => i.quantity - i.reserved <= i.lowStockThreshold).map(i => ({ id: i.id, product: i.product.name, sku: i.variant?.sku ?? i.product.sku, variant: i.variant?.name ?? null, available: Math.max(0, i.quantity - i.reserved), threshold: i.lowStockThreshold })).sort((a, b) => a.available - b.available).slice(0, 12)

    return json({
      periodDays: days,
      compareDays: compare,
      kpis: { revenue, orders: currentOrders.length, averageOrderValue, itemsSold, newCustomers: customers, products, previousRevenue, revenueChange: pct(revenue, previousRevenue) },
      series: Array.from(seriesMap, ([date, value]) => ({ date, ...value })),
      topProducts: Array.from(topProductsMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10),
      lowStock,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to load analytics'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 401 })
  }
}
