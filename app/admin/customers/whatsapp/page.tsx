import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import WhatsAppList from '@/components/whatsapp-list'

// Admin > Customers > WhatsApp list: numbers from the welcome-discount popup, for offers.
export default async function WhatsAppListPage() {
  const user = await requirePermission('customers.view')
  const [rows, timezone] = await Promise.all([
    db.phoneSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 5000, select: { id: true, phone: true, name: true, source: true, createdAt: true } }),
    getStoreTimezone(),
  ])
  return <WhatsAppList initial={JSON.parse(JSON.stringify(rows))} timezone={timezone} canManage={hasPermission(user, 'customers.manage')} />
}
