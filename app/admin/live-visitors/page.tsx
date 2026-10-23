import { requirePermission } from '@/lib/auth'
import VisitorsLive from '@/components/visitors-live'
import { liveReport, todayReport } from '@/lib/visitor-report'
import ui from '@/components/admin-ui.module.css'

export default async function LiveVisitors() {
  await requirePermission('reports.view')
  const [live, today] = await Promise.all([liveReport(), todayReport()])
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS & INSIGHTS</span>
        <h1 className={ui.title}>Live visitors</h1>
        <p className={ui.muted}>Who is on your store right now, what they are looking at, and how today is going.</p>
      </div>
    </div>
    <VisitorsLive initialLive={JSON.parse(JSON.stringify(live))} initialToday={JSON.parse(JSON.stringify(today))} />
  </div>
}
