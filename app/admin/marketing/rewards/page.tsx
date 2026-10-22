import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreTimezone } from '@/lib/store-timezone'
import { siteUrl } from '@/lib/seo'
import { getRewardsConfig, loadRewardCustomers } from '@/lib/rewards'
import { codeState } from '@/lib/rewards-shared'
import RewardsAdmin from '@/components/rewards-admin'

export const dynamic = 'force-dynamic'

// Admin > Marketing > Rewards (lib/rewards.ts): customers who reached every N delivered orders, and the
// thank-you codes made for them.
export default async function RewardsPage() {
  const user = await requirePermission('customers.view')
  const config = await getRewardsConfig()
  const [due, made, store, timezone] = await Promise.all([
    loadRewardCustomers(config),
    db.phoneReward.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    getStoreIdentity(),
    getStoreTimezone(),
  ])
  const coupons = made.length ? await db.coupon.findMany({ where: { code: { in: made.map(m => m.code) } }, select: { code: true, value: true, usedCount: true, expiresAt: true, isActive: true } }) : []
  const byCode = new Map(coupons.map(c => [c.code, c]))
  return <RewardsAdmin
    config={config}
    due={due.slice(0, 300)}
    made={made.map(m => { const c = byCode.get(m.code); return { code: m.code, phone: m.phone, name: m.name || '', createdAt: m.createdAt.toISOString(), percent: c?.value ?? config.percent, expiresAt: c?.expiresAt?.toISOString() || null, state: codeState(c) } })}
    storeName={store.name}
    siteUrl={siteUrl()}
    timezone={timezone}
    canManage={hasPermission(user, 'coupons.manage')}
  />
}
