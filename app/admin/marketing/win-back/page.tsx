import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreIdentity } from '@/lib/store-identity'
import { getBlockedPhones } from '@/lib/blocked-phones'
import { internationalPhone } from '@/lib/phone'
import { siteUrl } from '@/lib/seo'
import { WINBACK_CODE_KEY, WINBACK_QUIET_DAYS, winbackCustomers, winbackDays } from '@/lib/winback'
import WinbackAdmin from '@/components/winback-admin'

export const dynamic = 'force-dynamic'

// Admin > Marketing > Win back (lib/winback.ts).
export default async function WinbackPage({ searchParams }: { searchParams: Promise<{ days?: string; all?: string }> }) {
  const user = await requirePermission('customers.view')
  const params = await searchParams
  const days = winbackDays(params.days)
  const showAll = params.all === '1'
  const [orders, contacts, code, store, blocked, timezone] = await Promise.all([
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 20000, select: { id: true, orderNumber: true, status: true, grandTotal: true, currency: true, createdAt: true, phone: true, shippingAddressJson: true } }),
    db.winbackContact.findMany({ select: { phone: true, contactedAt: true } }),
    db.setting.findUnique({ where: { key: WINBACK_CODE_KEY } }).then(r => r?.value || ''),
    getStoreIdentity(),
    getBlockedPhones().catch(() => []),
    getStoreTimezone(),
  ])
  const blockedSet = new Set(blocked.map(b => internationalPhone(b.phone, store.country)).filter(Boolean))
  const contacted = new Map(contacts.map(c => [c.phone, c.contactedAt.toISOString()]))
  const quietSince = Date.now() - WINBACK_QUIET_DAYS * 24 * 60 * 60 * 1000
  const all = winbackCustomers(orders, { days, storeCountry: store.country, blocked: blockedSet })
  const recentlyMessaged = all.filter(c => { const at = contacted.get(c.phone); return !!at && new Date(at).getTime() > quietSince })
  const list = (showAll ? all : all.filter(c => !recentlyMessaged.includes(c))).slice(0, 300)
  return <WinbackAdmin
    initial={list.map(c => ({ ...c, contactedAt: contacted.get(c.phone) || null }))}
    total={all.length}
    hidden={showAll ? 0 : recentlyMessaged.length}
    days={days}
    showAll={showAll}
    code={code}
    storeName={store.name}
    siteUrl={siteUrl()}
    timezone={timezone}
    canManage={hasPermission(user, 'customers.manage')}
  />
}
