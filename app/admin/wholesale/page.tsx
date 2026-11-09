import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import ui from '@/components/admin-ui.module.css'
import WholesaleInquiriesAdmin from '@/components/wholesale-inquiries-admin'

// Admin > Customers > Wholesale inquiries: the requests from the /wholesale form, newest first.
export default async function WholesaleInquiries() {
  const user = await requirePermission('customers.view')
  const rows = await db.wholesaleInquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>CUSTOMERS</span>
        <h1 className={ui.title}>Wholesale inquiries</h1>
        <p className={ui.muted}>Shops and offices that asked about buying in quantity. Reply by email or phone, then set the status.</p>
      </div>
    </div>
    <WholesaleInquiriesAdmin
      canManage={hasPermission(user, 'customers.manage')}
      rows={rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), handledAt: row.handledAt ? row.handledAt.toISOString() : null }))}
    />
  </div>
}
