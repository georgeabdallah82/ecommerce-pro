import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, parseJson, slugify } from '@/lib/utils'

// This storefront only ever exposes one blog (sitemap.ts and /blog/[handle]
// address a post purely by its own globally-unique handle, with no blog
// handle in the URL) -- admins manage posts directly, and a single Blog
// row is created lazily the first time a post needs one.
async function ensureDefaultBlog() {
  const existing = await db.blog.findFirst()
  if (existing) return existing
  return db.blog.create({ data: { title: 'Blog', handle: 'news' } })
}

function cleanHandle(value: unknown, fallback: string) {
  return slugify(String(value || fallback)).slice(0, 200)
}

function cleanStatus(value: unknown) {
  return value === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
}

// tagsJson stores a JSON string array (or null) on a plain String column --
// sanitizeTags normalizes admin input into that shape, readTags parses it back.
function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  for (const raw of input) {
    const tag = String(raw ?? '').trim().slice(0, 40)
    if (tag) seen.add(tag)
    if (seen.size >= 20) break
  }
  return [...seen]
}

function readTags(tagsJson: string | null): string[] {
  const parsed = parseJson<unknown>(tagsJson, [])
  return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
}

export async function GET() {
  try {
    await requirePermission('content.view')
    const posts = await db.blogPost.findMany({ orderBy: { updatedAt: 'desc' } })
    return json(posts.map((p) => ({ ...p, tags: readTags(p.tagsJson) })))
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

    const blog = await ensureDefaultBlog()
    const status = cleanStatus(b.status)
    const tags = sanitizeTags(b.tags)
    const post = await db.blogPost.create({
      data: {
        blogId: blog.id,
        title,
        handle,
        excerpt: b.excerpt ? String(b.excerpt).trim().slice(0, 500) : null,
        bodyHtml: b.bodyHtml ? String(b.bodyHtml).slice(0, 200000) : null,
        featuredImage: b.featuredImage ? String(b.featuredImage).trim().slice(0, 2000) : null,
        status,
        tagsJson: tags.length ? JSON.stringify(tags) : null,
        seoTitle: b.seoTitle ? String(b.seoTitle).trim().slice(0, 200) : null,
        seoDescription: b.seoDescription ? String(b.seoDescription).trim().slice(0, 500) : null,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    })
    await audit(actor.id, 'blogPost.created', 'BlogPost', post.id, { title, handle, status })
    return json({ post: { ...post, tags } }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create post'
    if (message.includes('Unique constraint')) return json({ error: 'A post with this handle already exists.' }, { status: 409 })
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Post id is required' }, { status: 400 })
    const existing = await db.blogPost.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Post not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (b.title !== undefined) {
      const title = String(b.title).trim().slice(0, 200)
      if (!title) return json({ error: 'Title is required' }, { status: 400 })
      data.title = title
    }
    if (b.handle !== undefined) {
      const handle = cleanHandle(b.handle, existing.title)
      if (!handle) return json({ error: 'Handle is required' }, { status: 400 })
      data.handle = handle
    }
    if (b.excerpt !== undefined) data.excerpt = b.excerpt ? String(b.excerpt).trim().slice(0, 500) : null
    if (b.bodyHtml !== undefined) data.bodyHtml = b.bodyHtml ? String(b.bodyHtml).slice(0, 200000) : null
    if (b.featuredImage !== undefined) data.featuredImage = b.featuredImage ? String(b.featuredImage).trim().slice(0, 2000) : null
    if (b.tags !== undefined) { const tags = sanitizeTags(b.tags); data.tagsJson = tags.length ? JSON.stringify(tags) : null }
    if (b.seoTitle !== undefined) data.seoTitle = b.seoTitle ? String(b.seoTitle).trim().slice(0, 200) : null
    if (b.seoDescription !== undefined) data.seoDescription = b.seoDescription ? String(b.seoDescription).trim().slice(0, 500) : null
    if (b.status !== undefined) {
      const status = cleanStatus(b.status)
      data.status = status
      if (status === 'PUBLISHED' && !existing.publishedAt) data.publishedAt = new Date()
    }

    const post = await db.blogPost.update({ where: { id }, data })
    await audit(actor.id, 'blogPost.updated', 'BlogPost', id, { fields: Object.keys(data) })
    return json({ post: { ...post, tags: readTags(post.tagsJson) } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update post'
    if (message.includes('Unique constraint')) return json({ error: 'A post with this handle already exists.' }, { status: 409 })
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return json({ error: 'Post id is required' }, { status: 400 })
    await db.blogPost.delete({ where: { id } })
    await audit(actor.id, 'blogPost.deleted', 'BlogPost', id, {})
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete post'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}
