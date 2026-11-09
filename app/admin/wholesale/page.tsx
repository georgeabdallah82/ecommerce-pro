import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ui from '@/components/admin-ui.module.css'

// Admin > Customers > Wholesale inquiries: the requests from the /wholesale form, newest first.
export default async function WholesaleInquiries() {
  await requirePermission('customers.view')
  const rows = await db.wholesaleInquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>CUSTOMERS</span>
        <h1 className={ui.title}>Wholesale inquiries</h1>
        <p className={ui.muted}>Shops and offices that asked about buying in quantity. Reply by email or phone.</p>
      </div>
    </div>
    <section className={ui.card} style={{ padding: 0, overflow: 'auto' }}>
      {rows.length ? <table className={ui.table}>
        <thead><tr><th>Received</th><th>Business</th><th>Contact</th><th>Interested in</th><th>Message</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td>{row.createdAt.toLocaleDateString('en-GB')}</td>
          <td><strong>{row.businessName}</strong>{row.city ? <div className={ui.muted}>{row.city}</div> : null}</td>
          <td><div>{row.contactName}</div><a href={`mailto:${row.email}`}>{row.email}</a><div><a href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}>{row.phone}</a></div></td>
          <td>{row.interest || '—'}</td>
          <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>{row.message || '—'}</td>
        </tr>)}</tbody>
      </table> : <p className={ui.muted} style={{ padding: 16 }}>No wholesale inquiries yet.</p>}
    </section>
  </div>
}
