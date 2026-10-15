import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { sendAbandonedCheckoutEmail } from '@/lib/email'
import { json } from '@/lib/utils'
import { isOptedOut, unsubscribeUrls } from '@/lib/cart-reminders'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('abandonedCheckouts.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Abandoned checkout id is required' }, { status: 400 })
    const checkout = await db.abandonedCheckout.findUnique({ where: { id } })
    if (!checkout) return json({ error: 'Abandoned checkout not found' }, { status: 404 })
    if (!checkout.email) return json({ error: 'This checkout has no email on file' }, { status: 400 })
    if (await isOptedOut(checkout.email)) return json({ error: 'This customer unsubscribed from cart reminder emails' }, { status: 400 })
    const result = await sendAbandonedCheckoutEmail(id, unsubscribeUrls((process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, ''), id))
    if (!result.sent) return json({ error: result.skipped ? 'Recovery emails are turned off in settings' : 'Unable to send recovery email' }, { status: 400 })
    // Counts as this checkout's reminder: the automatic one won't send a second.
    await db.abandonedCheckout.update({ where: { id }, data: { reminderState: 'sent', reminderAt: new Date(), reminderNote: `Sent by ${actor.name || 'staff'}` } })
    await audit(actor.id, 'abandoned_checkout.recovery_email_sent', 'AbandonedCheckout', id, { email: checkout.email })
    return json({ ok: true })
  } catch (e) { return routeError(e, 'Unable to send recovery email', 400) }
}
