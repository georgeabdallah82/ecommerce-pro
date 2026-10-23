import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreTimezone } from '@/lib/store-timezone'
import UnfinishedCheckouts from '@/components/unfinished-checkouts'

const DAYS = 14

// Admin > Orders > Unfinished checkouts: shoppers who reached checkout, gave a phone number or an
// email, and left without ordering -- with a WhatsApp reminder ready to send.
export default async function UnfinishedCheckoutsPage() {
  const user = await requirePermission('abandonedCheckouts.view')
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  const [rows, recovered, store, timezone] = await Promise.all([
    db.abandonedCheckout.findMany({
      where: { status: 'OPEN', lastActivity: { gte: since }, OR: [{ phone: { not: null } }, { email: { not: null } }] },
      select: { id: true, name: true, phone: true, email: true, cartJson: true, subtotal: true, currency: true, recoveryUrl: true, lastActivity: true, whatsappAt: true, reminderState: true, reminderAt: true, reminderNote: true, city: true, area: true, pinLat: true, pinLng: true },
      orderBy: { lastActivity: 'desc' },
      take: 200,
    }),
    db.abandonedCheckout.count({ where: { status: 'RECOVERED', recoveredAt: { gte: since } } }),
    getStoreIdentity(),
    getStoreTimezone(),
  ])
  return <UnfinishedCheckouts initial={JSON.parse(JSON.stringify(rows))} recovered={recovered} days={DAYS} storeName={store.name} timezone={timezone} canManage={hasPermission(user, 'abandonedCheckouts.manage')} />
}
