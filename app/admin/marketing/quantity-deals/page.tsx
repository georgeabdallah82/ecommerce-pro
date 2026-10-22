import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getQuantityDeals } from '@/lib/quantity-deals'
import { getStoreCurrency } from '@/lib/store-currency'
import QuantityDealsAdmin from '@/components/quantity-deals-admin'

export const dynamic = 'force-dynamic'

// Admin > Marketing > Quantity deals: "Buy 2, save 10%" and "3 for $20" (lib/quantity-deals-shared.ts).
export default async function QuantityDealsPage() {
  const user = await requirePermission('coupons.view')
  const [config, products, currency] = await Promise.all([
    getQuantityDeals(),
    db.product.findMany({ select: { id: true, name: true, basePrice: true, status: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 1000 }),
    getStoreCurrency(),
  ])
  return <QuantityDealsAdmin initial={config} products={products.filter(p => p.status !== 'ARCHIVED')} currency={currency} canManage={hasPermission(user, 'coupons.manage')} />
}
