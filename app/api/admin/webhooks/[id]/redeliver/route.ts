import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { redeliverWebhook } from '@/lib/webhooks'
import { json } from '@/lib/utils'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('settings.manage')
    const { id } = await params
    await redeliverWebhook(id)
    const webhook = await db.webhookEndpoint.findUnique({ where: { id } })
    if (!webhook) return json({ error: 'Webhook endpoint not found' }, { status: 404 })
    await audit(actor.id, 'webhook.redelivered', 'WebhookEndpoint', id, { lastStatus: webhook.lastStatus })
    const { secret: _secret, lastPayload: _lastPayload, ...rest } = webhook
    return json({ webhook: { ...rest, secretConfigured: true } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to redeliver webhook'
    const status = message === 'FORBIDDEN' ? 403 : message.includes('not found') ? 404 : 400
    return json({ error: message }, { status })
  }
}
