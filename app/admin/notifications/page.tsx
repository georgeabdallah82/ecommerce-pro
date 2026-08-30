import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CustomerNotificationCenter from '@/components/customer-notification-center'

export default async function CustomerNotificationsPage() {
  await requirePermission('settings.view')
  const [customers, recent] = await Promise.all([
    db.user.findMany({ where: { role: 'CUSTOMER', isActive: true }, select: { id: true, name: true, email: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
    db.notification.findMany({ where: { type: 'MARKETING_PUSH' }, select: { id: true, title: true, body: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  return <main className="section"><div className="container" style={{ maxWidth: 1200 }}><div className="sectionHead"><div><span className="muted">MARKETING</span><h1 className="h2">Customer notifications</h1><p className="muted">Send push deals and store messages to customers who have opted in.</p></div></div><CustomerNotificationCenter customers={customers} recent={recent.map(item => ({ ...item, createdAt: item.createdAt.toISOString() }))} /></div></main>
}
