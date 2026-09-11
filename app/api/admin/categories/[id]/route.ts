import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('categories.manage')
    const { id } = await params
    const b = await req.json()
    const existing = await db.category.findUnique({ where: { id } })
    if (!existing) return json({ error: 'Category not found' }, { status: 404 })

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
    if (b.parentId !== undefined) {
      const parentId = b.parentId ? String(b.parentId) : null
      if (parentId === id) return json({ error: 'A category cannot be its own parent' }, { status: 400 })
      if (parentId) {
        const parent = await db.category.findUnique({ where: { id: parentId } })
        if (!parent) return json({ error: 'Parent category not found' }, { status: 400 })
        if (parent.parentId === id) return json({ error: 'Cannot set a child category as the parent' }, { status: 400 })
      }
      data.parentId = parentId
    }

    const category = await db.category.update({ where: { id }, data })
    await audit(actor.id, 'category.updated', 'Category', id, { fields: Object.keys(data) })
    return json({ category })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update category'
    if (message.includes('Unique constraint')) return json({ error: 'A category with this slug already exists.' }, { status: 409 })
    return json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('categories.manage')
    const { id } = await params
    const existing = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } })
    if (!existing) return json({ error: 'Category not found' }, { status: 404 })
    // MongoDB has no native FK support, so onDelete: SetNull (declared on both
    // Product.category and Category.parent in the source schema) is stripped to
    // NoAction by the mongodb schema conversion -- clear the references
    // ourselves before deleting, matching the intended SetNull semantics
    // instead of leaving dangling categoryId/parentId values behind.
    await db.$transaction(async tx => {
      await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
      await tx.category.updateMany({ where: { parentId: id }, data: { parentId: null } })
      await tx.category.delete({ where: { id } })
    })
    await audit(actor.id, 'category.deleted', 'Category', id, { name: existing.name, productCount: existing._count.products, childCount: existing._count.children })
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to delete category' }, { status: 400 })
  }
}
