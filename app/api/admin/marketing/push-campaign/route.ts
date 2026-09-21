import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { sendCustomerPushCampaign } from '@/lib/push'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const body = await req.json().catch(() => ({}))
    const title = String(body?.title || '').trim()
    const message = String(body?.body || '').trim()
    const url = String(body?.url || '').trim()
    if (!title) return json({ error: 'Title is required' }, { status: 400 })
    if (!message) return json({ error: 'Message is required' }, { status: 400 })
    if (url && !url.startsWith('/')) return json({ error: 'URL must be a relative path starting with /' }, { status: 400 })

    const result = await sendCustomerPushCampaign({ title, body: message, url: url || undefined })
    await db.auditLog.create({ data: { actorId: actor.id, action: 'ADMIN_PUSH_CAMPAIGN', entity: 'customer', metadataJson: JSON.stringify({ title, sent: result.sent, failed: result.failed }) } })
    return json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send push campaign'
    return json({ error: message === 'FORBIDDEN' ? 'Forbidden' : message === 'UNAUTHORIZED' ? 'Unauthorized' : message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
