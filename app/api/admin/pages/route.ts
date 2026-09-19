import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'
import { RESERVED_HANDLES } from '@/lib/reserved-handles'

function cleanHandle(value: unknown, fallback: string) {
  return slugify(String(value || fallback)).slice(0, 200)
}

function cleanStatus(value: unknown) {
  return value === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
}

export async function GET() {
  try {
    await requirePermission('content.view')
    return json(await db.page.findMany({ orderBy: { updatedAt: 'desc' } }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json()
    const title = String(b.title || '').trim().slice(0, 200)
    if (!title) return json({ error: 'Title is required' }, { status: 400 })
    const handle = cleanHandle(b.handle, title)
    if (!handle) return json({ error: 'Handle is required' }, { status: 400 })
    if (RESERVED_HANDLES.has(handle)) return json({ error: `"${handle}" is a reserved path and can't be used as a page handle` }, { status: 400 })

    const status = cleanStatus(b.status)
    const page = await db.page.create({
      data: {
        title,
        handle,
        bodyHtml: b.bodyHtml ? String(b.bodyHtml).slice(0, 200000) : null,
        status,
        seoTitle: b.seoTitle ? String(b.seoTitle).trim().slice(0, 200) : null,
        seoDescription: b.seoDescription ? String(b.seoDescription).trim().slice(0, 500) : null,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    })
    await audit(actor.id, 'page.created', 'Page', page.id, { title, handle, status })
    return json({ page }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create page'
    if (message.includes('Unique constraint')) return json({ error: 'A page with this handle already exists.' }, { status: 409 })
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Page id is required' }, { status: 400 })
    const existing = await db.page.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Page not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (b.title !== undefined) {
      const title = String(b.title).trim().slice(0, 200)
      if (!title) return json({ error: 'Title is required' }, { status: 400 })
      data.title = title
    }
    if (b.handle !== undefined) {
      const handle = cleanHandle(b.handle, existing.title)
      if (!handle) return json({ error: 'Handle is required' }, { status: 400 })
      if (RESERVED_HANDLES.has(handle)) return json({ error: `"${handle}" is a reserved path and can't be used as a page handle` }, { status: 400 })
      data.handle = handle
    }
    if (b.bodyHtml !== undefined) data.bodyHtml = b.bodyHtml ? String(b.bodyHtml).slice(0, 200000) : null
    if (b.seoTitle !== undefined) data.seoTitle = b.seoTitle ? String(b.seoTitle).trim().slice(0, 200) : null
    if (b.seoDescription !== undefined) data.seoDescription = b.seoDescription ? String(b.seoDescription).trim().slice(0, 500) : null
    if (b.status !== undefined) {
      const status = cleanStatus(b.status)
      data.status = status
      if (status === 'PUBLISHED' && !existing.publishedAt) data.publishedAt = new Date()
    }

    const page = await db.page.update({ where: { id }, data })
    await audit(actor.id, 'page.updated', 'Page', id, { fields: Object.keys(data) })
    return json({ page })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update page'
    if (message.includes('Unique constraint')) return json({ error: 'A page with this handle already exists.' }, { status: 409 })
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return json({ error: 'Page id is required' }, { status: 400 })
    await db.page.delete({ where: { id } })
    await audit(actor.id, 'page.deleted', 'Page', id, {})
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete page'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}
