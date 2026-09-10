import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import InventoryAdminPro from '@/components/inventory-admin-pro'
import AdminInventoryVisualStyles from '@/components/admin-inventory-visual-styles'

export default async function Inventory() {
  const user = await requirePermission('inventory.view')
  const rows = await db.inventoryItem.findMany({
    include: {
      product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      variant: true,
      movements: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
    orderBy: [{ quantity: 'asc' }, { id: 'asc' }],
  })
  return <><AdminInventoryVisualStyles /><InventoryAdminPro initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'inventory.manage')} /></>
}
