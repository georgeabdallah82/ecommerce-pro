import { requirePermission } from '@/lib/auth'
import PosReturns from '@/components/pos-returns'

// Returns and refunds at the till. Needs the permission to refund.
export default async function PosReturnsPage() {
  await requirePermission('orders.refund')
  return <PosReturns />
}
