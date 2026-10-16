import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { createInviteReward } from '@/lib/invites'
import { inviteRewardMessage } from '@/lib/invites-shared'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreCurrency } from '@/lib/store-currency'
import { getStoreTimezone } from '@/lib/store-timezone'
import { formatAdminDate } from '@/lib/admin-datetime'
import { whatsappChatLink } from '@/lib/checkout-followup'
import { money } from '@/lib/config'
import { siteUrl } from '@/lib/seo'

// Makes the inviter's thank-you code for a friend's delivered order (Admin > Marketing > Invite a
// friend) and answers with the WhatsApp message to send it.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const body = await req.json().catch(() => ({})) as { orderId?: unknown }
    const orderId = String(body.orderId || '').trim()
    if (!orderId) return json({ error: 'Choose an order' }, { status: 400 })
    let reward
    try {
      reward = await createInviteReward(orderId)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unable to make the code' }, { status: 409 })
    }
    const [store, currency, timezone] = await Promise.all([getStoreIdentity(), getStoreCurrency(), getStoreTimezone()])
    const message = inviteRewardMessage({
      storeName: store.name, inviterName: reward.inviterName, friendName: reward.friendName, amount: money(reward.amount, currency),
      code: reward.rewardCode, expires: formatAdminDate(reward.expiresAt, timezone), siteUrl: siteUrl(),
    })
    await audit(actor.id, 'invite.reward_created', 'Order', orderId, { rewardCode: reward.rewardCode })
    return json({ rewardCode: reward.rewardCode, whatsappHref: whatsappChatLink(reward.inviterPhone, message) })
  } catch (error) {
    return routeError(error, 'Unable to make the code', 400)
  }
}
