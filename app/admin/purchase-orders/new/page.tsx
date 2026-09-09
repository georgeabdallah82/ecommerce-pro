import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import PurchaseOrderForm from '@/components/purchase-order-form'

export default async function NewPurchaseOrderPage() {
  await requirePermission('purchaseOrders.manage')
  const [products, locations] = await Promise.all([
    db.product.findMany({ include: { variants: true }, orderBy: { name: 'asc' }, take: 500 }),
    db.storeLocation.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
  ])
  return <PurchaseOrderForm products={JSON.parse(JSON.stringify(products))} locations={JSON.parse(JSON.stringify(locations))} />
}
