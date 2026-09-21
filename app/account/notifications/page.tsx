import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { Footer } from '@/components/footer'
import { MarkAllReadButton, MarkReadButton } from '@/components/notification-actions'
import CustomerPushToggle from '@/components/customer-push-toggle'

const PAGE_SIZE = 20

export default async function Notifications({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const u = await getCurrentUser()
  if (!u) return <><main className="section"><div className="container"><span className="muted">ACCOUNT</span><h1 className="h2">Notifications</h1><div className="card" style={{ padding: 24, maxWidth: 560 }}><h3>Sign in to view your notifications</h3><div style={{ display: 'flex', gap: 10 }}><Link className="btn" href="/account/login">Sign in</Link></div></div></div></main><Footer /></>

  const { page: pageParam } = await searchParams
  const requestedPage = Number(pageParam) || 1
  const [total, unreadCount] = await Promise.all([
    db.notification.count({ where: { userId: u.id } }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)

  const notifications = await db.notification.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  })

  return <><main className="section"><div className="container">
    <Link className="textLink" href="/account">← Back to account</Link>
    <div className="sectionHead"><div><span className="muted">ACCOUNT</span><h1 className="h2">Notifications</h1></div>{unreadCount > 0 && <MarkAllReadButton />}</div>
    <div style={{ marginBottom: 16 }}>
      <CustomerPushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
    </div>
    {!notifications.length ? (
      <div className="card empty"><p className="muted">No notifications yet.</p></div>
    ) : (
      <div className="grid" style={{ gap: 10 }}>
        {notifications.map(n => (
          <div className="card" style={{ padding: 18 }} key={n.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!n.readAt && <span className="pill">New</span>}
                  <strong>{n.title}</strong>
                </div>
                <p className="muted" style={{ marginTop: 6 }}>{n.body}</p>
                <small className="muted">{n.createdAt.toLocaleString()}</small>
              </div>
              {!n.readAt && <MarkReadButton id={n.id} />}
            </div>
          </div>
        ))}
      </div>
    )}
    {totalPages > 1 && (
      <div className="inline" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        {page > 1 ? <Link className="btn secondary" href={`/account/notifications?page=${page - 1}`}>← Previous</Link> : <span />}
        <span className="muted">Page {page} of {totalPages}</span>
        {page < totalPages ? <Link className="btn secondary" href={`/account/notifications?page=${page + 1}`}>Next →</Link> : <span />}
      </div>
    )}
  </div></main><Footer /></>
}
