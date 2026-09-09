import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import InventoryTransfersList from '@/components/inventory-transfers-list'

export default async function InventoryTransfersPage() {
  const user = await requirePermission('transfers.view')
  const rows = await db.inventoryTransfer.findMany({ include: { items: true, fromLocation: true, toLocation: true }, orderBy: { createdAt: 'desc' }, take: 200 })
  return <InventoryTransfersList initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'transfers.manage')} />
}
