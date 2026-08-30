import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'
import AdminDataTransfer from '@/components/admin-data-transfer'

export default async function Reports(){
  const user = await requirePermission('reports.view')
  const canImport = ['SUPER_ADMIN','ADMIN','MANAGER','EDITOR'].includes(user.role)
  return <><AnalyticsAdmin /><AdminDataTransfer canImport={canImport} /></>
}
