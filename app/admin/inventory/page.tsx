import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import InventoryAdminPro from '@/components/inventory-admin-pro'

export default async function Inventory() {
  const user = await requirePermission('inventory.view')
  const [rows, locations] = await Promise.all([
    db.inventoryItem.findMany({
      include: {
        product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
        variant: true,
        location: true,
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
      orderBy: [{ quantity: 'asc' }, { id: 'asc' }],
    }),
    db.storeLocation.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
  ])
  return <InventoryAdminPro initial={JSON.parse(JSON.stringify(rows))} locations={JSON.parse(JSON.stringify(locations))} canManage={hasPermission(user.role, 'inventory.manage')} />
}
