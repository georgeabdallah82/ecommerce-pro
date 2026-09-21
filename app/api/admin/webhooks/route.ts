import { randomBytes } from 'node:crypto'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const webhookStatuses = new Set(['ACTIVE', 'DISABLED'])

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !!url.hostname
  } catch {
    return false
  }
}

export async function GET() {
  try {
    await requirePermission('settings.view')
    const rows = await db.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } })
    return json(rows.map(({ secret: _secret, lastPayload, ...r }) => ({ ...r, secretConfigured: true, hasFailedDelivery: !!lastPayload })))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Forbidden'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 401 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const b = await req.json()
    const topic = String(b.topic || '').trim()
    const endpointUrl = String(b.endpointUrl || '').trim()
    if (!topic || topic.length > 120) return json({ error: 'A valid topic is required' }, { status: 400 })
    if (!isHttpsUrl(endpointUrl) || endpointUrl.length > 2048) return json({ error: 'A valid HTTPS endpointUrl is required' }, { status: 400 })

    const providedSecret = typeof b.secret === 'string' ? b.secret.trim() : ''
    const secret = providedSecret || randomBytes(24).toString('hex')
    if (secret.length < 16 || secret.length > 255) return json({ error: 'Webhook secret must be between 16 and 255 characters' }, { status: 400 })

    const webhook = await db.webhookEndpoint.create({ data: { topic, endpointUrl, secret, status: 'ACTIVE' } })
    await audit(actor.id, 'webhook.created', 'WebhookEndpoint', webhook.id, { topic, endpointUrl })
    // Unlike every other response from this route, the create response includes
    // the cleartext secret once (matching /api/admin/api-credentials' pattern) --
    // it's otherwise unrecoverable, since GET and PATCH always strip it.
    return json({ webhook: { ...webhook, secretConfigured: true } }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create webhook endpoint'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const b = await req.json()
    const id = typeof b.id === 'string' ? b.id.trim() : ''
    if (!id) return json({ error: 'Webhook id is required' }, { status: 400 })

    const data: { status?: 'ACTIVE' | 'DISABLED'; endpointUrl?: string; topic?: string } = {}
    if (b.status !== undefined) {
      const status = String(b.status).trim()
      if (!webhookStatuses.has(status)) return json({ error: 'Invalid webhook status' }, { status: 400 })
      data.status = status as 'ACTIVE' | 'DISABLED'
    }
    if (b.endpointUrl !== undefined) {
      const endpointUrl = String(b.endpointUrl).trim()
      if (!isHttpsUrl(endpointUrl) || endpointUrl.length > 2048) return json({ error: 'A valid HTTPS endpointUrl is required' }, { status: 400 })
      data.endpointUrl = endpointUrl
    }
    if (b.topic !== undefined) {
      const topic = String(b.topic).trim()
      if (!topic || topic.length > 120) return json({ error: 'A valid topic is required' }, { status: 400 })
      data.topic = topic
    }
    if (!Object.keys(data).length) return json({ error: 'No valid webhook fields supplied' }, { status: 400 })

    const webhook = await db.webhookEndpoint.update({ where: { id }, data })
    await audit(actor.id, 'webhook.updated', 'WebhookEndpoint', id, { fields: Object.keys(data) })
    return json({ webhook: { ...webhook, secret: undefined, lastPayload: undefined, secretConfigured: true } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update webhook endpoint'
    const status = message === 'FORBIDDEN' ? 403 : message.includes('Record to update not found') ? 404 : 400
    return json({ error: message }, { status })
  }
}
