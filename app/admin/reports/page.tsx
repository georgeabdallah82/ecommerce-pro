import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'

export default async function Reports(){
  await requirePermission('reports.view')
  return <AnalyticsAdmin />
}
