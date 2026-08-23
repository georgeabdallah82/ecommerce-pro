import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

export async function GET(req: Request) {
  try {
    await requirePermission('reports.view')
    const { searchParams } = new URL(req.url)
    const days = Math.min(365, Math.max(1, Number(searchParams.get('days') || 30)))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [orders, lowStock, customers] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since }, status: { not: OrderStatus.CANCELLED } },
        select: { grandTotal: true, items: { select: { quantity: true, totalPrice: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.inventoryItem.findMany({
        where: { quantity: { gt: 0 } },
        include: { product: { select: { id: true, name: true, sku: true } }, variant: { select: { id: true, name: true, sku: true } } },
      }),
      db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: since } } }),
    ])

    const revenue = orders.reduce((sum, o) => sum + o.grandTotal, 0)
    const itemCount = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)
    const salesValue = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.totalPrice, 0), 0)
    const lowStockItems = lowStock.filter(i => i.quantity - i.reserved <= i.lowStockThreshold).map(i => ({
      productId: i.productId,
      product: i.product.name,
      sku: i.variant?.sku ?? i.product.sku,
      variant: i.variant?.name ?? null,
      quantity: i.quantity,
      reserved: i.reserved,
      available: Math.max(0, i.quantity - i.reserved),
      threshold: i.lowStockThreshold,
    }))

    return json({
      periodDays: days,
      orders: orders.length,
      revenue,
      averageOrderValue: orders.length ? Math.round(revenue / orders.length) : 0,
      itemsSold: itemCount,
      salesValue,
      newCustomers: customers,
      lowStock: lowStockItems,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load report'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 401 })
  }
}
