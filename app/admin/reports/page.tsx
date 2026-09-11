import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'
import AdminDataTransfer from '@/components/admin-data-transfer'
import LiveVisitorsAdmin from '@/components/live-visitors-admin'
import ui from '@/components/admin-ui.module.css'

export default async function Reports() {
  const user = await requirePermission('reports.view')
  const canImport = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EDITOR'].includes(user.role)

  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS & INSIGHTS</span>
        <h1 className={ui.title}>Reports & Analytics</h1>
        <p className={ui.muted}>Understand sales performance, inventory health, and what is happening on your storefront right now.</p>
      </div>
    </div>
    <AnalyticsAdmin />
    <LiveVisitorsAdmin />
    <section style={{ marginTop: 40, borderTop: '1px solid var(--admin-border)', paddingTop: 32 }}>
      <div className={ui.sectionHead}>
        <div>
          <h2 className={ui.title} style={{ fontSize: 24 }}>Data management</h2>
          <p className={ui.muted}>Safely import and export products, categories, and collections.</p>
        </div>
      </div>
      <AdminDataTransfer canImport={canImport} />
    </section>
  </div>
}
