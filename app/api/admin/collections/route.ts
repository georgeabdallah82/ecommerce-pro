import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'
import { pagedReply, readPaging } from '@/lib/admin-paging'
import type { Prisma } from '@prisma/client'

// Collections in storefront order, a page at a time (50 by default, 200 at most). `status` (ALL,
// ACTIVE or INACTIVE) and `q` filter the page. `counts` always covers the whole catalogue, so the
// tabs stay correct while a search is on.
export async function GET(req: Request) {
  try {
    await requirePermission('collections.view')
    const { searchParams } = new URL(req.url)
    const { skip, take } = readPaging(searchParams, 50, 200)
    const q = (searchParams.get('q') || '').trim().slice(0, 120)
    const status = searchParams.get('status')
    const where: Prisma.CollectionWhereInput = {}
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }]
    if (status === 'ACTIVE') where.isActive = true
    if (status === 'INACTIVE') where.isActive = false
    const [rows, total, all, active, inactive] = await Promise.all([
      db.collection.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }], skip, take }),
      db.collection.count({ where }),
      db.collection.count(),
      db.collection.count({ where: { isActive: true } }),
      db.collection.count({ where: { isActive: false } }),
    ])
    return json({ ...pagedReply(rows, total, skip, take), counts: { all, active, inactive } })
  } catch (e) {
    return routeError(e, 'Forbidden', 403)
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
      if (bulkAction === 'ADD_PRODUCTS') {
        const requested: string[] = Array.from(new Set<string>(Array.isArray(b.productIds) ? b.productIds.map((x: unknown) => String(x).trim().slice(0, 100)).filter((x: string) => Boolean(x)) : []))
        if (!requested.length) return json({ error: 'Choose at least one product' }, { status: 400 })
        if (requested.length > 500) return json({ error: 'Too many products selected' }, { status: 400 })
        const [targets, products] = await Promise.all([
          db.collection.findMany({ where: { id: { in: ids } }, select: { id: true } }),
          db.product.findMany({ where: { id: { in: requested } }, select: { id: true } }),
        ])
        const productIds = products.map(p => p.id)
        const targetIds = targets.map(t => t.id)
        if (!productIds.length || !targetIds.length) return json({ error: 'Nothing to add' }, { status: 400 })
        // A product already in a collection keeps its place there; the others go to the end, in order.
        const [links, last] = await Promise.all([
          db.collectionProduct.findMany({ where: { collectionId: { in: targetIds }, productId: { in: productIds } }, select: { collectionId: true, productId: true } }),
          db.collectionProduct.groupBy({ by: ['collectionId'], where: { collectionId: { in: targetIds } }, _max: { sortOrder: true } }),
        ])
        const have = new Set(links.map(l => `${l.collectionId}|${l.productId}`))
        const lastOrder = new Map(last.map(l => [l.collectionId, l._max.sortOrder ?? -1]))
        const data: Array<{ collectionId: string; productId: string; sortOrder: number }> = []
        for (const collectionId of targetIds) {
          let order = (lastOrder.get(collectionId) ?? -1) + 1
          for (const productId of productIds) {
            if (have.has(`${collectionId}|${productId}`)) continue
            data.push({ collectionId, productId, sortOrder: order++ })
          }
        }
        if (data.length) await db.collectionProduct.createMany({ data, skipDuplicates: true })
        await audit(actor.id, 'collection.bulk_products_added', 'Collection', undefined, { ids: targetIds, productIds, added: data.length })
        return json({ ok: true, added: data.length, collections: targetIds.length })
      }
      if (bulkAction === 'DUPLICATE') {
        // Copies start hidden, so a duplicate cannot go live by accident.
        const sources = await db.collection.findMany({ where: { id: { in: ids } }, include: { products: { orderBy: { sortOrder: 'asc' } } } })
        for (const source of sources) {
          const base = slugify(`${source.slug}-copy`) || 'collection-copy'
          let slug = base
          for (let n = 2; await db.collection.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`
          await db.collection.create({ data: {
            name: `${source.name} (copy)`, slug, description: source.description, imageUrl: source.imageUrl,
            seoTitle: source.seoTitle, seoDescription: source.seoDescription, isActive: false, sortOrder: source.sortOrder,
            products: { create: source.products.map(p => ({ productId: p.productId, sortOrder: p.sortOrder })) },
          } })
        }
        await audit(actor.id, 'collection.bulk_duplicated', 'Collection', undefined, { ids: sources.map(s => s.id), count: sources.length })
        return json({ ok: true, count: sources.length })
      }
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
    const c = await db.collection.create({ data: { name, slug: slugify(String(b.slug || '')) || slugify(String(name)) || `collection-${Date.now().toString(36)}`, description: b.description || null, imageUrl: b.imageUrl || null, sortOrder: Number(b.sortOrder) || 0 } })
    if (Array.isArray(b.productIds) && b.productIds.length) await db.collectionProduct.createMany({ data: b.productIds.map((productId: string, i: number) => ({ collectionId: c.id, productId, sortOrder: i })) })
    await audit(actor.id, 'collection.created', 'Collection', c.id, { name })
    return json({ collection: c }, { status: 201 })
  } catch (e) {
    return routeError(e, 'Unable to create collection', 400)
  }
}
