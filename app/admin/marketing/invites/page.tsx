import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getSellingConfig } from '@/lib/selling-config'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreCurrency } from '@/lib/store-currency'
import { siteUrl } from '@/lib/seo'
import { money } from '@/lib/config'
import { formatAdminDate } from '@/lib/admin-datetime'
import { inviteRewardMessage } from '@/lib/invites-shared'
import { whatsappChatLink } from '@/lib/checkout-followup'
import InvitesAdmin, { type InviteRow } from '@/components/invites-admin'

export const dynamic = 'force-dynamic'

type Raw = { id: string; orderNumber: string; status: string; grandTotal: number; currency: string; createdAt: Date; shippingAddressJson: string; code: string; inviterPhone: string; inviterName: string | null; rewardCode: string | null; rewardUsed: number | null; rewardExpires: Date | null; rewardValue: number | null }

// Admin > Marketing > Invite a friend: friends' orders made with a customer's invite code, and the
// thank-you code for the inviter once the friend's order is delivered (lib/invites.ts).
export default async function InvitesPage() {
  const user = await requirePermission('customers.view')
  const [rows, codes, config, store, currency, timezone] = await Promise.all([
    db.$queryRaw<Raw[]>`
      SELECT o."id", o."orderNumber", o."status"::text AS "status", o."grandTotal", o."currency", o."createdAt", o."shippingAddressJson",
        i."code", i."phone" AS "inviterPhone", i."name" AS "inviterName",
        r."rewardCode", c."usedCount" AS "rewardUsed", c."expiresAt" AS "rewardExpires", c."value" AS "rewardValue"
      FROM "Order" o
      JOIN "InviteCode" i ON i."code" = upper(o."couponCode")
      LEFT JOIN "InviteReward" r ON r."orderId" = o."id"
      LEFT JOIN "Coupon" c ON c."code" = r."rewardCode"
      ORDER BY o."createdAt" DESC
      LIMIT 300`,
    db.inviteCode.count(),
    getSellingConfig().then(c => c.invite),
    getStoreIdentity(),
    getStoreCurrency(),
    getStoreTimezone(),
  ])
  const site = siteUrl()
  const list: InviteRow[] = rows.map(row => {
    let friend = ''
    try { friend = String(JSON.parse(row.shippingAddressJson || '{}')?.firstName || '').trim() } catch {}
    const inviterFirst = String(row.inviterName || '').trim().split(/\s+/)[0] || ''
    const message = row.rewardCode ? inviteRewardMessage({
      storeName: store.name, inviterName: inviterFirst, friendName: friend, amount: money(Number(row.rewardValue || 0), currency), code: row.rewardCode,
      expires: row.rewardExpires ? formatAdminDate(row.rewardExpires, timezone) : '', siteUrl: site,
    }) : ''
    return {
      orderId: row.id, orderNumber: row.orderNumber, status: row.status, total: money(Number(row.grandTotal), row.currency), createdAt: new Date(row.createdAt).toISOString(),
      friend, code: row.code, inviterPhone: row.inviterPhone, inviterName: row.inviterName || '',
      rewardCode: row.rewardCode, rewardUsed: Number(row.rewardUsed || 0) > 0, whatsappHref: row.rewardCode ? whatsappChatLink(row.inviterPhone, message) : '',
    }
  })
  return <InvitesAdmin
    initial={list}
    codes={codes}
    enabled={config.enabled}
    friendPercent={config.friendPercent}
    reward={config.reward ? money(config.reward, currency) : ''}
    timezone={timezone}
    canManage={hasPermission(user, 'customers.manage')}
  />
}
