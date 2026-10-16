import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import StockCount from '@/components/stock-count'

// Inventory > Stock count: scan each product's barcode with the phone camera (or type it, or
// use a barcode scanner) and enter how many are on the shelf.
export default async function StockCountPage() {
  const user = await requirePermission('inventory.view')
  return <StockCount canManage={hasPermission(user, 'inventory.manage')} />
}
