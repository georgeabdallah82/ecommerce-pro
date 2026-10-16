import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { listShippingRates } from '@/lib/pricing'
import { getStoreIdentity } from '@/lib/store-identity'
import ManualOrderForm, { type PickProduct } from '@/components/manual-order-form'

// Units left to sell, or null when the product isn't stock-tracked (always sellable). Same rule as
// lib/inventory.ts reserveStock: a variant's own stock rows, else the product's shared rows.
function available(product: { trackInventory: boolean; continueSellingWhenOutOfStock: boolean; inventory: { variantId: string | null; quantity: number; reserved: number }[] }, variantId: string | null) {
  if (!product.trackInventory || product.continueSellingWhenOutOfStock) return null
  const own = variantId ? product.inventory.filter(row => row.variantId === variantId) : []
  const rows = own.length ? own : product.inventory.filter(row => !row.variantId)
  return rows.reduce((sum, row) => sum + Math.max(0, row.quantity - row.reserved), 0)
}

export default async function NewManualOrderPage() {
  await requirePermission('orders.manage')
  const store = await getStoreIdentity()
  const [products, customers, rates] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE' }, include: { variants: true, inventory: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } }, orderBy: { name: 'asc' }, take: 500 }),
    db.user.findMany({ where: { role: 'CUSTOMER', isActive: true }, select: { id: true, name: true, email: true, phone: true }, orderBy: { name: 'asc' }, take: 500 }),
    listShippingRates(store.country).catch(() => []),
  ])
  const pick: PickProduct[] = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.basePrice,
    image: p.images[0]?.url || '',
    stock: available(p, null),
    variants: p.variants.map(v => ({ id: v.id, name: v.name, price: v.price ?? p.basePrice, stock: available(p, v.id) })),
  }))
  return <ManualOrderForm products={pick} customers={customers} rates={rates.map(r => ({ id: r.id, name: r.name, price: r.price, freeAbove: r.freeAbove }))} storeCountry={store.country} />
}
