import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { money } from '@/lib/config'
import { getStoreIdentity } from '@/lib/store-identity'
import { cartLines, displayPhone, unfinishedCheckoutMessage, whatsappChatLink } from '@/lib/checkout-followup'

const noStore = { 'Cache-Control': 'private, no-store' }

// Unfinished checkouts for the Android admin app: shoppers who started checkout and left, with the
// same WhatsApp reminder the web admin prepares (Admin > Orders > Unfinished, lib/checkout-followup.ts).
// Marking "WhatsApp opened" and dismissing go through PATCH /api/admin/abandoned-checkouts.
export async function GET() {
  try {
    await requirePermission('abandonedCheckouts.view')
    const [rows, store] = await Promise.all([
      db.abandonedCheckout.findMany({
        where: { status: 'OPEN' },
        orderBy: { lastActivity: 'desc' },
        take: 100,
        select: { id: true, name: true, phone: true, email: true, cartJson: true, subtotal: true, currency: true, recoveryUrl: true, lastActivity: true, whatsappAt: true, reminderState: true, city: true, area: true },
      }),
      getStoreIdentity(),
    ])
    return json({
      checkouts: rows.map(row => {
        const message = unfinishedCheckoutMessage({ storeName: store.name, name: row.name, cartJson: row.cartJson, subtotal: row.subtotal, currency: row.currency, recoveryUrl: row.recoveryUrl }, money)
        return {
          id: row.id, name: row.name, phone: displayPhone(row.phone) || null, email: row.email, subtotal: row.subtotal, currency: row.currency,
          lines: cartLines(row.cartJson), lastActivity: row.lastActivity, whatsappAt: row.whatsappAt, emailSent: row.reminderState === 'sent',
          place: [row.area, row.city].filter(Boolean).join(', ') || null,
          whatsappLink: whatsappChatLink(row.phone, message) || null,
        }
      }),
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load unfinished checkouts', 400, noStore) }
}
