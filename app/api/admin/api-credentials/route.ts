import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

function hash(value: string) { return createHash('sha256').update(value).digest('hex') }

export async function GET() {
  try {
    await requirePermission('apiCredentials.view')
    const rows = await db.apiCredential.findMany({ orderBy: { createdAt: 'desc' } })
    return json(rows.map(r => ({ ...r, keyHash: undefined })))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('apiCredentials.manage')
    const b = await req.json()
    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Credential name is required' }, { status: 400 })
    const secret = `ecom_${randomBytes(24).toString('hex')}`
    const prefix = secret.slice(0, 12)
    const credential = await db.apiCredential.create({ data: { name, keyPrefix: prefix, keyHash: hash(secret), scopesJson: JSON.stringify(Array.isArray(b.scopes) ? b.scopes : ['store.read']), expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } })
    await audit(actor.id, 'api_credential.created', 'ApiCredential', credential.id, { name, prefix, scopes: b.scopes })
    return json({ credential: { ...credential, keyHash: undefined }, secret }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create API credential' }, { status: 400 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('apiCredentials.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Credential id is required' }, { status: 400 })
    const credential = await db.apiCredential.update({ where: { id }, data: { ...(b.status ? { status: b.status } : {}), ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } : {}) } })
    await audit(actor.id, 'api_credential.updated', 'ApiCredential', id, { fields: Object.keys(b) })
    return json({ credential: { ...credential, keyHash: undefined } })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update API credential' }, { status: 400 }) }
}
