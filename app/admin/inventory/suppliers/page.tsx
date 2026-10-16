import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { SUPPLIERS_KEY, readSuppliers, supplierKey, type Supplier } from '@/lib/suppliers'
import SuppliersAdmin from '@/components/suppliers-admin'

export const dynamic = 'force-dynamic'

// Products > Suppliers: everyone named as a product's "Vendor / brand", plus suppliers added here.
export default async function SuppliersPage() {
  const user = await requirePermission('inventory.view')
  const [saved, vendors] = await Promise.all([
    db.setting.findUnique({ where: { key: SUPPLIERS_KEY }, select: { value: true } }),
    db.product.groupBy({ by: ['vendor'], where: { status: { not: 'ARCHIVED' }, vendor: { not: null } }, _count: { _all: true } }),
  ])
  const list = readSuppliers(saved?.value)
  const counts = new Map<string, number>()
  for (const v of vendors) {
    const name = String(v.vendor || '').trim()
    if (name) counts.set(supplierKey(name), (counts.get(supplierKey(name)) || 0) + v._count._all)
  }
  const rows: Array<Supplier & { products: number }> = list.map(s => ({ ...s, products: counts.get(supplierKey(s.name)) || 0 }))
  for (const v of vendors) {
    const name = String(v.vendor || '').trim()
    if (name && !rows.some(r => supplierKey(r.name) === supplierKey(name))) rows.push({ name, phone: '', contact: '', note: '', products: counts.get(supplierKey(name)) || 0 })
  }
  rows.sort((a, b) => b.products - a.products || a.name.localeCompare(b.name))
  return <SuppliersAdmin initial={rows} canEdit={hasPermission(user, 'inventory.manage')} />
}
