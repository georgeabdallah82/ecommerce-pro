import { requirePermission } from '@/lib/auth'
import LiveVisitorsAdmin from '@/components/live-visitors-admin'
import ui from '@/components/admin-ui.module.css'

export default async function LiveVisitors() {
  await requirePermission('reports.view')
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS & INSIGHTS</span>
        <h1 className={ui.title}>Live visitors</h1>
        <p className={ui.muted}>See who is on your storefront right now, where they are, and what they are looking at.</p>
      </div>
    </div>
    <LiveVisitorsAdmin />
  </div>
}
