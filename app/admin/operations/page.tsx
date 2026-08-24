import { requirePermission } from '@/lib/auth'
import AdminOperationsHub from '@/components/admin-operations-hub'

export default async function Operations() {
  await requirePermission('inventory.view')
  return <AdminOperationsHub />
}
