import { requirePermission } from '@/lib/auth'
import PushCampaignAdmin from '@/components/push-campaign-admin'
import ui from '@/components/admin-ui.module.css'

export default async function PushCampaigns() {
  await requirePermission('customers.manage')

  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>MARKETING</span>
        <h1 className={ui.title}>Push campaigns</h1>
        <p className={ui.muted}>Send a one-off push notification to every customer who has opted in.</p>
      </div>
    </div>
    <PushCampaignAdmin />
  </div>
}
