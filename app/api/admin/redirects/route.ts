import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const RESERVED_PREFIXES = ['/admin', '/api', '/_next', '/coming-soon']

function cleanPath(value: unknown) {
  let path = String(value || '').trim()
  if (path && !path.startsWith('/')) path = `/${path}`
  path = path.replace(/\/+$/, '') || '/'
  return path.slice(0, 400)
}

function validate(fromPath: string, toPath: string) {
  if (!fromPath || fromPath === '/') return 'A source path other than / is required'
  if (RESERVED_PREFIXES.some(p => fromPath === p || fromPath.startsWith(`${p}/`))) return 'This path is reserved and cannot be redirected'
  if (!toPath) return 'A destination path or URL is required'
  if (fromPath === toPath) return 'The source and destination cannot be the same'
  return null
}

export async function GET() {
  try {
    await requirePermission('content.view')
    return json(await db.redirect.findMany({ orderBy: { createdAt: 'desc' } }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json()
    const fromPath = cleanPath(b.fromPath)
    const toPath = /^https?:\/\//i.test(String(b.toPath || '').trim()) ? String(b.toPath).trim().slice(0, 2000) : cleanPath(b.toPath)
    const error = validate(fromPath, toPath)
    if (error) return json({ error }, { status: 400 })

    const redirect = await db.redirect.create({ data: { fromPath, toPath } })
    await audit(actor.id, 'redirect.created', 'Redirect', redirect.id, { fromPath, toPath })
    return json({ redirect }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create redirect'
    if (message.includes('Unique constraint')) return json({ error: 'A redirect from this path already exists.' }, { status: 409 })
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Redirect id is required' }, { status: 400 })
    const existing = await db.redirect.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Redirect not found' }, { status: 404 })

    const fromPath = b.fromPath !== undefined ? cleanPath(b.fromPath) : existing.fromPath
    const toPath = b.toPath !== undefined
      ? (/^https?:\/\//i.test(String(b.toPath).trim()) ? String(b.toPath).trim().slice(0, 2000) : cleanPath(b.toPath))
      : existing.toPath
    const error = validate(fromPath, toPath)
    if (error) return json({ error }, { status: 400 })

    const redirect = await db.redirect.update({ where: { id }, data: { fromPath, toPath } })
    await audit(actor.id, 'redirect.updated', 'Redirect', id, { fromPath, toPath })
    return json({ redirect })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update redirect'
    if (message.includes('Unique constraint')) return json({ error: 'A redirect from this path already exists.' }, { status: 409 })
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return json({ error: 'Redirect id is required' }, { status: 400 })
    await db.redirect.delete({ where: { id } })
    await audit(actor.id, 'redirect.deleted', 'Redirect', id, {})
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete redirect'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}
