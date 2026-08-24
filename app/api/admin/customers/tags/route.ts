import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('customers.view')
    return json(await db.customerTag.findMany({ include: { _count: { select: { customers: true } } }, orderBy: { value: 'asc' } }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const b = await req.json()
    const value = String(b.value || '').trim().slice(0, 100)
    if (!value) return json({ error: 'Tag value is required' }, { status: 400 })
    const tag = await db.customerTag.upsert({ where: { value }, update: {}, create: { value } })
    if (Array.isArray(b.customerIds) && b.customerIds.length) {
      await db.customerTagMember.createMany({ data: [...new Set(b.customerIds.map((x: unknown) => String(x)).filter(Boolean))].map((customerId: string) => ({ tagId: tag.id, customerId })), skipDuplicates: true })
    }
    await audit(actor.id, 'customer_tag.updated', 'CustomerTag', tag.id, { customerCount: Array.isArray(b.customerIds) ? b.customerIds.length : 0 })
    return json({ tag, customers: await db.customerTagMember.findMany({ where: { tagId: tag.id } }) })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to save customer tag' }, { status: 400 }) }
}
