import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'
import ui from '@/components/admin-ui.module.css'

export default async function Reports() {
  await requirePermission('reports.view')

  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS & INSIGHTS</span>
        <h1 className={ui.title}>Reports & Analytics</h1>
        <p className={ui.muted}>Understand sales performance and inventory health.</p>
      </div>
    </div>
    <AnalyticsAdmin />
  </div>
}
