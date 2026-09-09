import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0))
}

function cleanName(value: unknown) {
  return String(value || '').trim().slice(0, 120)
}

export async function GET() {
  try {
    await requirePermission('shipping.view')
    return json(await db.shippingZone.findMany({ include: { rates: true }, orderBy: { name: 'asc' } }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('shipping.manage')
    const b = await req.json()
    const name = cleanName(b.name)
    if (!name) return json({ error: 'Zone name is required' }, { status: 400 })

    const rateName = cleanName(b.rateName) || 'Standard'
    const countries = String(b.countries || '*').trim().slice(0, 2000)
    const regions = b.regions ? String(b.regions).trim().slice(0, 2000) : null
    const ratePrice = cents(b.price)
    const freeAbove = b.freeAbove === null || b.freeAbove === '' || b.freeAbove === undefined ? null : cents(b.freeAbove)
    const estimatedDays = b.estimatedDays === null || b.estimatedDays === '' || b.estimatedDays === undefined ? null : Math.max(0, Math.trunc(Number(b.estimatedDays) || 0))

    const zone = await db.shippingZone.create({
      data: {
        name,
        countries,
        regions,
        rates: {
          create: {
            name: rateName,
            price: ratePrice,
            freeAbove,
            estimatedDays,
            isActive: b.isActive !== false,
          },
        },
      },
      include: { rates: true },
    })

    await audit(actor.id, 'shipping.created', 'ShippingZone', zone.id, { name })
    return json({ zone }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create shipping zone'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('shipping.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Zone id is required' }, { status: 400 })

    const data: Record<string, unknown> = {}
    if (b.name !== undefined) {
      const name = cleanName(b.name)
      if (!name) return json({ error: 'Zone name cannot be empty' }, { status: 400 })
      data.name = name
    }
    if (b.countries !== undefined) data.countries = String(b.countries || '*').trim().slice(0, 2000)
    if (b.regions !== undefined) data.regions = b.regions ? String(b.regions).trim().slice(0, 2000) : null
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive)

    const zone = await db.shippingZone.update({ where: { id }, data, include: { rates: true } })
    if (b.rate && typeof b.rate === 'object' && b.rate.id) {
      const rateId = String(b.rate.id)
      const rateData: Record<string, unknown> = {}
      if (b.rate.name !== undefined) rateData.name = cleanName(b.rate.name) || 'Standard'
      if (b.rate.price !== undefined) rateData.price = cents(b.rate.price)
      if (b.rate.freeAbove !== undefined) rateData.freeAbove = b.rate.freeAbove === null || b.rate.freeAbove === '' ? null : cents(b.rate.freeAbove)
      if (b.rate.estimatedDays !== undefined) rateData.estimatedDays = b.rate.estimatedDays === null || b.rate.estimatedDays === '' ? null : Math.max(0, Math.trunc(Number(b.rate.estimatedDays) || 0))
      if (b.rate.isActive !== undefined) rateData.isActive = Boolean(b.rate.isActive)
      await db.shippingRate.update({ where: { id: rateId }, data: rateData })
    }

    if (Array.isArray(b.addRates) && b.addRates.length) {
      await db.shippingRate.createMany({
        data: b.addRates.map((rate: Record<string, unknown>) => ({
          zoneId: zone.id,
          name: cleanName(rate?.name) || 'Standard',
          price: cents(rate?.price),
          freeAbove: rate?.freeAbove === null || rate?.freeAbove === '' || rate?.freeAbove === undefined ? null : cents(rate?.freeAbove),
          estimatedDays: rate?.estimatedDays === null || rate?.estimatedDays === '' || rate?.estimatedDays === undefined ? null : Math.max(0, Math.trunc(Number(rate?.estimatedDays) || 0)),
          isActive: rate?.isActive !== false,
        })),
      })
    }

    const updated = await db.shippingZone.findUnique({ where: { id }, include: { rates: true } })
    await audit(actor.id, 'shipping.updated', 'ShippingZone', id, { fields: Object.keys(data), rateUpdated: Boolean(b.rate), ratesAdded: Array.isArray(b.addRates) ? b.addRates.length : 0 })
    return json({ zone: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update shipping zone'
    return json({ error: message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('shipping.manage')
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return json({ error: 'Zone id is required' }, { status: 400 })
    await db.shippingZone.delete({ where: { id } })
    await audit(actor.id, 'shipping.deleted', 'ShippingZone', id, {})
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete shipping zone'
    return json({ error: message }, { status: 400 })
  }
}
