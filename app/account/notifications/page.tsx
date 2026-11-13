import Link from 'next/link'
import { Bell, Gift, RotateCcw, ShoppingBag, Truck, type LucideIcon } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { StoreFooter } from '@/components/store-footer'
import { MarkAllReadButton, MarkReadButton } from '@/components/notification-actions'
import CustomerPushToggle from '@/components/customer-push-toggle'
import { getLang, getT } from '@/lib/i18n-server'
import { dateLocale } from '@/lib/i18n'

const PAGE_SIZE = 20

// What each kind of notice is about (the types written in app/api/checkout and app/api/admin).
const NOTICE_ICONS: Record<string, LucideIcon> = { ORDER_CREATED: ShoppingBag, ORDER_STATUS: Truck, ORDER_REFUND: RotateCcw, GIFT_CARD: Gift }

export default async function Notifications({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const t = await getT()
  const locale = dateLocale(await getLang())

  const u = await getCurrentUser()
  if (!u) return <><main className="section"><div className="container"><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Notifications')}</h1><div className="card" style={{ padding: 24, maxWidth: 560 }}><h2 className="accountTitle">{t('Sign in to view your notifications')}</h2><div style={{ display: 'flex', gap: 10 }}><Link className="btn" href="/account/login?next=%2Faccount%2Fnotifications">{t('Sign in')}</Link></div></div></div></main><StoreFooter /></>

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
    <Link className="textLink" href="/account">{t('Back to account')}</Link>
    <div className="sectionHead"><div><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Notifications')}</h1></div>{unreadCount > 0 && <MarkAllReadButton />}</div>
    <div style={{ marginBottom: 16 }}>
      <CustomerPushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
    </div>
    {!notifications.length ? (
      <div className="card empty"><p className="muted">{t('No notifications yet.')}</p></div>
    ) : (
      <div className="grid" style={{ gap: 10 }}>
        {notifications.map(n => {
          // An icon for what the notice is about, and unread ones stand out (app/storefront-details.css). The title and
          // text are stored as written (in English), so they keep their own direction on the Arabic page.
          const Icon = NOTICE_ICONS[n.type] || Bell
          return <div className={n.readAt ? 'card noticeCard' : 'card noticeCard isUnread'} key={n.id}>
            <span className="noticeIcon" aria-hidden="true"><Icon size={18} /></span>
            <div className="noticeText">
              <div className="noticeHead">
                {!n.readAt && <span className="pill">{t('New')}</span>}
                <strong dir="auto">{n.title}</strong>
              </div>
              <p className="muted" dir="auto">{n.body}</p>
              <small className="muted">{n.createdAt.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</small>
            </div>
            {!n.readAt && <MarkReadButton id={n.id} />}
          </div>
        })}
      </div>
    )}
    {totalPages > 1 && (
      <div className="inline" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        {page > 1 ? <Link className="btn secondary" href={`/account/notifications?page=${page - 1}`}>{t('Previous')}</Link> : <span />}
        <span className="muted">{t('Page {page} of {total}', { page, total: totalPages })}</span>
        {page < totalPages ? <Link className="btn secondary" href={`/account/notifications?page=${page + 1}`}>{t('Next')}</Link> : <span />}
      </div>
    )}
  </div></main><StoreFooter /></>
}
