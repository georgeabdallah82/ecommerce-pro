import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('collections.view')
    const { id } = await params
    const collection = await db.collection.findUnique({
      where: { id },
      include: {
        products: {
          orderBy: { sortOrder: 'asc' },
          include: { product: { include: { images: true, category: true, inventory: true, variants: { include: { inventory: true } } } } },
        },
      },
    })
    if (!collection) return json({ error: 'Collection not found' }, { status: 404 })
    return json({ collection })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('collections.manage')
    const { id } = await params
    const b = await req.json()
    const existing = await db.collection.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Collection not found' }, { status: 404 })

    const data: any = {}
    if (b.name !== undefined) {
      const name = String(b.name).trim()
      if (!name) return json({ error: 'Name required' }, { status: 400 })
      data.name = name
    }
    if (b.slug !== undefined) data.slug = slugify(String(b.slug || b.name || existing.name))
    if (b.description !== undefined) data.description = b.description ? String(b.description) : null
    if (b.imageUrl !== undefined) data.imageUrl = b.imageUrl ? String(b.imageUrl) : null
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive)
    if (b.sortOrder !== undefined) data.sortOrder = Math.trunc(Number(b.sortOrder) || 0)

    const collection = await db.$transaction(async tx => {
      const c = await tx.collection.update({ where: { id }, data })
      if (Array.isArray(b.productIds)) {
        const ids: string[] = Array.from(new Set<string>(b.productIds.map((x: unknown) => String(x)).filter((x: string) => x.length > 0)))
        await tx.collectionProduct.deleteMany({ where: { collectionId: id } })
        if (ids.length) {
          await tx.collectionProduct.createMany({ data: ids.map((productId: string, i: number) => ({ collectionId: id, productId, sortOrder: i })) })
        }
      }
      return c
    })

    await audit(actor.id, 'collection.updated', 'Collection', id, { fields: Object.keys(data), productCount: Array.isArray(b.productIds) ? b.productIds.length : undefined })
    return json({ collection })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update collection'
    if (message.includes('Unique constraint')) return json({ error: 'A collection with this handle already exists.' }, { status: 409 })
    return json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('collections.manage')
    const { id } = await params
    const existing = await db.collection.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Collection not found' }, { status: 404 })
    // CollectionProduct.collectionId is a required field with a declared
    // onDelete: Cascade that MongoDB's schema conversion strips to NoAction
    // (no native FK support) -- clear the join rows ourselves first, matching
    // the intended Cascade semantics, instead of leaving orphaned rows or
    // hitting Prisma's emulated referential-integrity error on delete.
    await db.$transaction(async tx => {
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } })
      await tx.collection.delete({ where: { id } })
    })
    await audit(actor.id, 'collection.deleted', 'Collection', id, { name: existing.name })
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to delete collection' }, { status: 400 })
  }
}
