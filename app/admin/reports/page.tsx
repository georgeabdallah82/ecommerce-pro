import { requirePermission, getCurrentUser } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import AnalyticsAdmin from '@/components/analytics-admin'
import AdminDataTransfer from '@/components/admin-data-transfer'

export default async function Reports(){
  await requirePermission('reports.view')
  const user = await getCurrentUser()
  const canImport = user ? hasPermission(user.role, 'products.manage') : false
  return <>
    <AdminDataTransfer canImport={canImport} />
    <AnalyticsAdmin />
  </>
}
