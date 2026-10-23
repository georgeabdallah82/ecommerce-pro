import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { getNotices } from '@/lib/team-notices-server'
import TeamNoticesAdmin from '@/components/team-notices-admin'
import ui from '@/components/admin-ui.module.css'

// Admin > Team notices: messages from the owner or a manager that every staff member sees at the top of
// the admin. Only staff with "Post team notices" reach this page.
export default async function TeamNoticesPage() {
  const user = await requirePermission('notices.manage')
  const notices = await getNotices().catch(() => [])
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>TEAM</span>
        <h1 className={ui.title}>Team notices</h1>
        <p className={ui.muted}>Write a short message for your staff. It shows at the top of every admin page until it expires or you remove it, and you can send a phone alert with it.</p>
      </div>
    </div>
    <TeamNoticesAdmin initial={JSON.parse(JSON.stringify(notices))} canManage={hasPermission(user, 'notices.manage')} />
  </div>
}
