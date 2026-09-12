import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

function cleanName(value: unknown) {
  return String(value || '').trim().slice(0, 120)
}

function cleanCountries(value: unknown) {
  return String(value || '*').trim().slice(0, 2000) || '*'
}

function cleanRate(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
}

export async function GET() {
  try {
    await requirePermission('tax.view')
    return json(await db.taxRate.findMany({ orderBy: { name: 'asc' } }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('tax.manage')
    const b = await req.json()
    const name = cleanName(b.name)
    if (!name) return json({ error: 'Tax rate name is required' }, { status: 400 })

    const rate = await db.taxRate.create({
      data: { name, countries: cleanCountries(b.countries), rate: cleanRate(b.rate), isActive: b.isActive !== false },
    })
    await audit(actor.id, 'tax.created', 'TaxRate', rate.id, { name, countries: rate.countries, rate: rate.rate })
    return json({ rate }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create tax rate'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('tax.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Tax rate id is required' }, { status: 400 })

    const data: Record<string, unknown> = {}
    if (b.name !== undefined) {
      const name = cleanName(b.name)
      if (!name) return json({ error: 'Tax rate name cannot be empty' }, { status: 400 })
      data.name = name
    }
    if (b.countries !== undefined) data.countries = cleanCountries(b.countries)
    if (b.rate !== undefined) data.rate = cleanRate(b.rate)
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive)

    const rate = await db.taxRate.update({ where: { id }, data })
    await audit(actor.id, 'tax.updated', 'TaxRate', id, { fields: Object.keys(data) })
    return json({ rate })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update tax rate'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('tax.manage')
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return json({ error: 'Tax rate id is required' }, { status: 400 })
    await db.taxRate.delete({ where: { id } })
    await audit(actor.id, 'tax.deleted', 'TaxRate', id, {})
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete tax rate'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}
