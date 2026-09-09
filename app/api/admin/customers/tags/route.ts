import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('customerTags.view')
    const tags = await db.customerTag.findMany({ orderBy: { value: 'asc' } })
    const rows = await Promise.all(tags.map(async tag => ({ ...tag, _count: { customers: await db.customerTagMember.count({ where: { tagId: tag.id } }) } })))
    return json(rows)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customerTags.manage')
    const b = await req.json()
    const value = String(b.value || '').trim().slice(0, 100)
    if (!value) return json({ error: 'Tag value is required' }, { status: 400 })
    const tag = await db.customerTag.upsert({ where: { value }, update: {}, create: { value } })
    const customerIds: string[] = Array.isArray(b.customerIds)
      ? Array.from(new Set<string>(b.customerIds.map((x: unknown) => String(x)).filter((x: string) => x.length > 0)))
      : []
    for (const customerId of customerIds) {
      await db.customerTagMember.upsert({ where: { tagId_customerId: { tagId: tag.id, customerId } }, update: {}, create: { tagId: tag.id, customerId } })
    }
    await audit(actor.id, 'customer_tag.updated', 'CustomerTag', tag.id, { customerCount: customerIds.length })
    return json({ tag, customers: await db.customerTagMember.findMany({ where: { tagId: tag.id } }) })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to save customer tag' }, { status: 400 }) }
}
