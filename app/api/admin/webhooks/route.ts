import { randomBytes } from 'node:crypto'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('settings.view')
    const rows = await db.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } })
    return json(rows.map(r => ({ ...r, secret: `${r.secret.slice(0, 6)}••••${r.secret.slice(-4)}` })))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const b = await req.json()
    const topic = String(b.topic || '').trim()
    const endpointUrl = String(b.endpointUrl || '').trim()
    if (!topic || !/^https:\/\//i.test(endpointUrl)) return json({ error: 'Valid topic and HTTPS endpointUrl are required' }, { status: 400 })
    const secret = String(b.secret || randomBytes(24).toString('hex'))
    const webhook = await db.webhookEndpoint.create({ data: { topic, endpointUrl, secret, status: 'ACTIVE' } })
    await audit(actor.id, 'webhook.created', 'WebhookEndpoint', webhook.id, { topic, endpointUrl })
    return json({ webhook }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create webhook endpoint' }, { status: 400 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Webhook id is required' }, { status: 400 })
    const webhook = await db.webhookEndpoint.update({ where: { id }, data: { ...(b.status ? { status: b.status } : {}), ...(b.endpointUrl ? { endpointUrl: String(b.endpointUrl) } : {}), ...(b.topic ? { topic: String(b.topic) } : {}) } })
    await audit(actor.id, 'webhook.updated', 'WebhookEndpoint', id, { fields: Object.keys(b) })
    return json({ webhook })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update webhook endpoint' }, { status: 400 }) }
}
