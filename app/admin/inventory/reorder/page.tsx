import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreCurrency } from '@/lib/store-currency'
import { REORDER_COVER_DAYS, REORDER_SALES_DAYS, reorderList, stockKey, type ReorderStock } from '@/lib/reorder'
import ReorderAdmin from '@/components/reorder-admin'

export const dynamic = 'force-dynamic'

// Inventory > What to reorder (lib/reorder.ts): sales of the last 30 days against the stock left.
export default async function ReorderPage({ searchParams }: { searchParams: Promise<{ cover?: string }> }) {
  await requirePermission('inventory.view')
  const coverRaw = Number((await searchParams).cover)
  const cover = (REORDER_COVER_DAYS as readonly number[]).includes(coverRaw) ? coverRaw : 30
  const since = new Date(Date.now() - REORDER_SALES_DAYS * 24 * 60 * 60 * 1000)
  const [items, sales, store, currency] = await Promise.all([
    db.inventoryItem.findMany({
      where: { product: { status: 'ACTIVE', trackInventory: true } },
      select: { productId: true, variantId: true, quantity: true, reserved: true, lowStockThreshold: true, product: { select: { name: true, sku: true, vendor: true, costPrice: true } }, variant: { select: { name: true, sku: true } } },
      take: 10000,
    }),
    db.orderItem.groupBy({ by: ['productId', 'variantId'], where: { order: { createdAt: { gte: since }, status: { notIn: ['CANCELLED', 'REFUNDED'] } }, unitPrice: { gt: 0 } }, _sum: { quantity: true } }),
    getStoreIdentity(),
    getStoreCurrency(),
  ])
  // One row per product or option, adding up its stock in every location.
  const stock = new Map<string, ReorderStock>()
  for (const item of items) {
    const key = stockKey(item.productId, item.variantId)
    const existing = stock.get(key)
    const available = item.quantity - item.reserved
    if (existing) { existing.available += available; existing.threshold = Math.max(existing.threshold, item.lowStockThreshold); continue }
    const variant = item.variant?.name && item.variant.name !== 'Default Title' ? item.variant.name : ''
    stock.set(key, {
      key, productId: item.productId, name: item.product.name, variant, sku: item.variant?.sku || item.product.sku,
      supplier: String(item.product.vendor || '').trim(), cost: item.product.costPrice ?? null, available, threshold: item.lowStockThreshold,
    })
  }
  const rows = reorderList([...stock.values()], sales.map(s => ({ productId: s.productId, variantId: s.variantId, quantity: s._sum.quantity || 0 })), { coverDays: cover })
  return <ReorderAdmin rows={rows} cover={cover} storeName={store.name} currency={currency} />
}
