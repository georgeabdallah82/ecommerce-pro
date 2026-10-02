import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'

export default async function Reports() {
  await requirePermission('reports.view')
  // AnalyticsAdmin renders the page heading (with its date controls), so there is one title.
  return <AnalyticsAdmin />
}
