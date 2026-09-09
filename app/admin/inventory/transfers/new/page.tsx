import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import InventoryTransferForm from '@/components/inventory-transfer-form'

export default async function NewInventoryTransferPage() {
  await requirePermission('transfers.manage')
  const [products, locations] = await Promise.all([
    db.product.findMany({ include: { variants: true }, orderBy: { name: 'asc' }, take: 500 }),
    db.storeLocation.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
  ])
  return <InventoryTransferForm products={JSON.parse(JSON.stringify(products))} locations={JSON.parse(JSON.stringify(locations))} />
}
