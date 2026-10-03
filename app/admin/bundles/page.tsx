import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getBundleConfig } from '@/lib/bundles'
import { getStoreCurrency } from '@/lib/store-currency'
import BundlesAdmin from '@/components/bundles-admin'

export default async function BundlesPage() {
  const user = await requirePermission('products.view')
  const [config, products, currency] = await Promise.all([
    getBundleConfig(),
    db.product.findMany({ select: { id: true, name: true, basePrice: true, status: true, variants: { select: { id: true, name: true, price: true } } }, orderBy: { name: 'asc' }, take: 1000 }),
    getStoreCurrency(),
  ])
  // Archived products can't be sold, so they can't go in a bundle either.
  const sellable = products.filter(p => p.status !== 'ARCHIVED')
  return <BundlesAdmin initial={config} products={JSON.parse(JSON.stringify(sellable))} currency={currency} canManage={hasPermission(user, 'products.manage')} />
}
