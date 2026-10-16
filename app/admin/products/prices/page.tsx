import { requirePermission } from '@/lib/auth'
import { getStoreCurrency } from '@/lib/store-currency'
import BulkPrices from '@/components/bulk-prices'

export const dynamic = 'force-dynamic'

// Products > Change prices (lib/bulk-prices.ts).
export default async function ChangePricesPage() {
  await requirePermission('products.manage')
  return <BulkPrices currency={await getStoreCurrency()} />
}
