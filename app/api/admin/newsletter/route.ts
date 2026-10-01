import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { listSubscribers, normalizeEmail, removeSubscriber, subscribersToCsv } from '@/lib/newsletter'

export async function GET(req: Request) {
  try {
    await requirePermission('customers.view')
    const rows = await listSubscribers()
    if (new URL(req.url).searchParams.get('format') === 'csv') {
      return new Response(subscribersToCsv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="newsletter-subscribers.csv"', 'cache-control': 'no-store' } })
    }
    return json({ subscribers: rows })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const email = normalizeEmail(new URL(req.url).searchParams.get('email'))
    if (!email) return json({ error: 'A valid email is required' }, { status: 400 })
    await removeSubscriber(email)
    await audit(actor.id, 'newsletter.subscriber.removed', 'NewsletterSubscriber', email)
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to remove subscriber' }, { status: 400 }) }
}
