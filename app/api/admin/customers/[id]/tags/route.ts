import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const JSON_HEADERS = { 'Cache-Control': 'private, no-store' }

async function getCustomer(id: string) {
  return db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customerTags.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const value = String(body?.value ?? '').trim().replace(/\s+/g, ' ').slice(0, 100)
    if (!value) return json({ error: 'Tag is required' }, { status: 400, headers: JSON_HEADERS })

    const customer = await getCustomer(id)
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: JSON_HEADERS })

    const result = await db.$transaction(async tx => {
      const tag = await tx.customerTag.upsert({ where: { value }, update: {}, create: { value } })
      await tx.customerTagMember.upsert({
        where: { tagId_customerId: { tagId: tag.id, customerId: id } },
        update: {},
        create: { tagId: tag.id, customerId: id },
      })
      return tag
    })

    await audit(actor.id, 'customer_tag.added', 'User', id, { tag: value })
    return json({ tag: result }, { headers: JSON_HEADERS })
  } catch (error) {
    console.error('[admin/customer-tags] POST failed', error)
    return json({ error: 'Unable to add customer tag' }, { status: 500, headers: JSON_HEADERS })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customerTags.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const tagId = String(body?.tagId ?? '').trim()
    if (!tagId) return json({ error: 'Tag id is required' }, { status: 400, headers: JSON_HEADERS })

    const customer = await getCustomer(id)
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: JSON_HEADERS })

    const membership = await db.customerTagMember.findUnique({
      where: { tagId_customerId: { tagId, customerId: id } },
      select: { tagId: true },
    })
    if (!membership) return json({ error: 'Tag is not assigned to this customer' }, { status: 404, headers: JSON_HEADERS })

    await db.customerTagMember.delete({ where: { tagId_customerId: { tagId, customerId: id } } })
    await audit(actor.id, 'customer_tag.removed', 'User', id, { tagId })
    return json({ ok: true }, { headers: JSON_HEADERS })
  } catch (error) {
    console.error('[admin/customer-tags] DELETE failed', error)
    return json({ error: 'Unable to remove customer tag' }, { status: 500, headers: JSON_HEADERS })
  }
}
