import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { loadInfluencers } from '@/lib/influencers'
import { influencerMessage } from '@/lib/influencers-shared'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreCurrency } from '@/lib/store-currency'
import { internationalPhone } from '@/lib/phone'
import { whatsappChatLink } from '@/lib/checkout-followup'
import { formatAdminDate } from '@/lib/admin-datetime'
import { siteUrl } from '@/lib/seo'
import { money } from '@/lib/config'
import InfluencersAdmin, { type InfluencerView } from '@/components/influencers-admin'

export const dynamic = 'force-dynamic'

// Admin > Marketing > Influencers: each influencer's own code, the orders it brought, what they earned
// on delivered orders and what is still owed (lib/influencers.ts).
export default async function InfluencersPage() {
  const user = await requirePermission('coupons.view')
  const [rows, store, currency, timezone] = await Promise.all([loadInfluencers(), getStoreIdentity(), getStoreCurrency(), getStoreTimezone()])
  const site = siteUrl()
  const views: InfluencerView[] = rows.map(row => {
    const phone = internationalPhone(row.phone, store.country)
    return {
      id: row.id, name: row.name, handle: row.handle, phone: row.phone, code: row.code, customerPercent: row.customerPercent, commissionPercent: row.commissionPercent,
      isActive: row.isActive, notes: row.notes,
      orders: row.stats.orders, delivered: row.stats.delivered,
      sales: money(row.stats.sales, currency), waitingSales: money(row.stats.waitingSales, currency),
      earned: money(row.stats.earned, currency), waiting: money(row.stats.waiting, currency), waitingCents: row.stats.waiting, paid: money(row.stats.paid, currency),
      owed: money(row.stats.owed, currency), owedCents: row.stats.owed, overpaid: row.stats.overpaid ? money(row.stats.overpaid, currency) : '',
      whatsappHref: phone ? whatsappChatLink(phone, influencerMessage({ storeName: store.name, name: row.name, code: row.code, customerPercent: row.customerPercent, commissionPercent: row.commissionPercent, siteUrl: site })) : '',
      recentOrders: row.recentOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, date: formatAdminDate(o.createdAt, timezone), value: money(o.value, o.currency), commission: o.commission ? money(o.commission, o.currency) : '' })),
      payouts: row.payouts.map(p => ({ id: p.id, amount: money(p.amount, currency), note: p.note, date: formatAdminDate(p.paidAt, timezone) })),
    }
  })
  const totalOwed = rows.reduce((sum, row) => sum + row.stats.owed, 0)
  return <InfluencersAdmin
    initial={views}
    totalOwed={money(totalOwed, currency)}
    currency={currency}
    canManage={hasPermission(user, 'coupons.manage')}
  />
}
