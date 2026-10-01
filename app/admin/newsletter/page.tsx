import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { listSubscribers } from '@/lib/newsletter'
import NewsletterAdmin from '@/components/newsletter-admin'
import ui from '@/components/admin-ui.module.css'

export const dynamic = 'force-dynamic'

export default async function NewsletterSubscribers() {
  const user = await requirePermission('customers.view')
  const subscribers = await listSubscribers()
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>MARKETING</span>
        <h1 className={ui.title}>Email subscribers</h1>
        <p className={ui.muted}>Everyone who signed up through the Newsletter section or the footer form. Customers with an account are also tagged &ldquo;Newsletter subscriber&rdquo;.</p>
      </div>
    </div>
    <NewsletterAdmin initial={subscribers} canManage={hasPermission(user.role, 'customers.manage')} />
  </div>
}
