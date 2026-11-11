import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { SUPPLIERS_KEY, ordersBySupplier, readSuppliers, supplierKey } from '@/lib/suppliers'
import SuppliersAdmin, { type SupplierRow } from '@/components/suppliers-admin'

export const dynamic = 'force-dynamic'

// Products > Suppliers: everyone named as a product's "Vendor / brand", plus suppliers added here,
// with how often each has been ordered from (purchase orders) and the store's country, which the
// WhatsApp number check needs.
export default async function SuppliersPage() {
  const user = await requirePermission('inventory.view')
  const [saved, vendors, orders, identity] = await Promise.all([
    db.setting.findUnique({ where: { key: SUPPLIERS_KEY }, select: { value: true } }),
    db.product.groupBy({ by: ['vendor'], where: { status: { not: 'ARCHIVED' }, vendor: { not: null } }, _count: { _all: true } }),
    db.purchaseOrder.findMany({ where: { supplierName: { not: null } }, select: { supplierName: true, status: true, orderedAt: true, createdAt: true } }),
    getStoreIdentity(),
  ])
  const list = readSuppliers(saved?.value)
  const productCounts = new Map<string, number>()
  for (const v of vendors) {
    const name = String(v.vendor || '').trim()
    if (name) productCounts.set(supplierKey(name), (productCounts.get(supplierKey(name)) || 0) + v._count._all)
  }
  const orderStats = ordersBySupplier(orders)
  const rowFor = (s: { name: string; phone: string; contact: string; note: string }): SupplierRow => {
    const key = supplierKey(s.name)
    const stats = orderStats[key]
    return { ...s, products: productCounts.get(key) || 0, orders: stats?.orders || 0, open: stats?.open || 0, lastOrderedAt: stats?.lastOrderedAt || null }
  }
  const rows: SupplierRow[] = list.map(rowFor)
  for (const v of vendors) {
    const name = String(v.vendor || '').trim()
    if (name && !rows.some(r => supplierKey(r.name) === supplierKey(name))) rows.push(rowFor({ name, phone: '', contact: '', note: '' }))
  }
  rows.sort((a, b) => b.products - a.products || a.name.localeCompare(b.name))
  return <SuppliersAdmin initial={rows} country={identity.country} canEdit={hasPermission(user, 'inventory.manage')} />
}
