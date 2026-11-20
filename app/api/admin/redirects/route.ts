import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { cappedJson, LIST_CAP } from '@/lib/admin-list'
import { cleanFromPath, cleanToPath, redirectProblem } from '@/lib/redirects'
import { clearEdgeCopies } from '@/lib/edge-config'
import { runInBackground } from '@/lib/background'

// The rules for the two addresses (a path only for the old one, no redirects from the store's own pages, no
// circles) are in lib/redirects.ts. The circle check reads every redirect: the table is the store's own short list.
const others = () => db.redirect.findMany({ select: { id: true, fromPath: true, toPath: true } })

export async function GET() {
  try {
    await requirePermission('content.view')
    return cappedJson(await db.redirect.findMany({ orderBy: { createdAt: 'desc' }, take: LIST_CAP + 1 }), LIST_CAP)
  } catch (e) {
    return routeError(e, 'Forbidden', 403)
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json()
    const fromPath = cleanFromPath(b.fromPath)
    const toPath = cleanToPath(b.toPath)
    const error = redirectProblem(fromPath, toPath, await others())
    if (error) return json({ error }, { status: 400 })

    const redirect = await db.redirect.create({ data: { fromPath, toPath } })
    await audit(actor.id, 'redirect.created', 'Redirect', redirect.id, { fromPath, toPath })
    await clearEdgeCopies('config', runInBackground)
    return json({ redirect }, { status: 201 })
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) return json({ error: 'A redirect from this path already exists.' }, { status: 409 })
    return routeError(e, 'Unable to create redirect', 400)
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

    const fromPath = b.fromPath !== undefined ? cleanFromPath(b.fromPath) : existing.fromPath
    const toPath = b.toPath !== undefined ? cleanToPath(b.toPath) : existing.toPath
    const error = redirectProblem(fromPath, toPath, await others(), id)
    if (error) return json({ error }, { status: 400 })

    const redirect = await db.redirect.update({ where: { id }, data: { fromPath, toPath } })
    await audit(actor.id, 'redirect.updated', 'Redirect', id, { fromPath, toPath })
    await clearEdgeCopies('config', runInBackground)
    return json({ redirect })
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) return json({ error: 'A redirect from this path already exists.' }, { status: 409 })
    return routeError(e, 'Unable to update redirect', 400)
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
    await clearEdgeCopies('config', runInBackground)
    return json({ ok: true })
  } catch (e) {
    return routeError(e, 'Unable to delete redirect', 400)
  }
}
