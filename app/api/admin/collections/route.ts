import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('collections.view')
    return json(await db.collection.findMany({ include: { _count: { select: { products: true } } }, orderBy: { sortOrder: 'asc' } }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('collections.manage')
    const b = await req.json()

    if (b.action === 'bulk') {
      const ids: string[] = Array.from(new Set<string>(Array.isArray(b.ids) ? b.ids.map((x: unknown) => String(x).trim().slice(0, 100)).filter((x: string) => Boolean(x)) : []))
      if (!ids.length) return json({ error: 'Select at least one collection' }, { status: 400 })
      if (ids.length > 500) return json({ error: 'Too many collections selected' }, { status: 400 })
      const bulkAction = String(b.bulkAction || '')
      if (bulkAction === 'ACTIVATE' || bulkAction === 'DEACTIVATE') {
        const result = await db.collection.updateMany({ where: { id: { in: ids } }, data: { isActive: bulkAction === 'ACTIVATE' } })
        await audit(actor.id, 'collection.bulk_updated', 'Collection', undefined, { ids, action: bulkAction, count: result.count })
        return json({ ok: true, count: result.count })
      }
      if (bulkAction === 'DELETE') {
        const targets = await db.collection.findMany({ where: { id: { in: ids } }, select: { id: true } })
        // CollectionProduct.collectionId is a required field with a declared onDelete: Cascade
        // that MongoDB's schema conversion strips to NoAction (no native FK support) -- clear
        // the join rows ourselves first, matching the same pattern the single-collection DELETE
        // route already uses.
        await db.$transaction(async tx => {
          for (const target of targets) {
            await tx.collectionProduct.deleteMany({ where: { collectionId: target.id } })
            await tx.collection.delete({ where: { id: target.id } })
          }
        })
        await audit(actor.id, 'collection.bulk_deleted', 'Collection', undefined, { ids: targets.map(t => t.id), count: targets.length })
        return json({ ok: true, count: targets.length })
      }
      return json({ error: 'Unsupported bulk action' }, { status: 400 })
    }

    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Name required' }, { status: 400 })
    const c = await db.collection.create({ data: { name, slug: slugify(String(b.slug || name)), description: b.description || null, imageUrl: b.imageUrl || null, sortOrder: Number(b.sortOrder) || 0 } })
    if (Array.isArray(b.productIds) && b.productIds.length) await db.collectionProduct.createMany({ data: b.productIds.map((productId: string, i: number) => ({ collectionId: c.id, productId, sortOrder: i })) })
    await audit(actor.id, 'collection.created', 'Collection', c.id, { name })
    return json({ collection: c }, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to create collection' }, { status: 400 })
  }
}
