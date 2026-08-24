import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import InventoryAdminPro from '@/components/inventory-admin-pro'

export default async function Inventory() {
  await requirePermission('inventory.view')
  const rows = await db.inventoryItem.findMany({
    include: {
      product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      variant: true,
      movements: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
    orderBy: [{ quantity: 'asc' }, { id: 'asc' }],
  })
  return <InventoryAdminPro initial={JSON.parse(JSON.stringify(rows))} />
}
