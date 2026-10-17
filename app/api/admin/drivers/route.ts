import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { internationalPhone } from '@/lib/phone'
import { getStoreIdentity } from '@/lib/store-identity'
import { newDriverToken } from '@/lib/drivers'

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

// Admin > Orders > Drivers: add a driver, change their name or phone, give them a new link
// (the old one stops working), or turn them off.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = clean(body.name, 60)
    if (!name) return json({ error: 'Write the driver\'s name' }, { status: 400 })
    const phone = body.phone ? internationalPhone(clean(body.phone, 40), (await getStoreIdentity()).country) : ''
    if (body.phone && !phone) return json({ error: 'This phone number looks incomplete, e.g. 70 123 456' }, { status: 400 })
    const driver = await db.driver.create({ data: { name, phone: phone || null, token: newDriverToken() } })
    await audit(actor.id, 'driver.created', 'Driver', driver.id, { name })
    return json({ driver }, { status: 201 })
  } catch (error) { return routeError(error, 'Unable to add the driver', 400) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = clean(body.id, 64)
    if (!id || !await db.driver.findUnique({ where: { id }, select: { id: true } })) return json({ error: 'Driver not found' }, { status: 404 })
    const data: { name?: string; phone?: string | null; active?: boolean; token?: string } = {}
    if (body.name !== undefined) { data.name = clean(body.name, 60); if (!data.name) return json({ error: 'Write the driver\'s name' }, { status: 400 }) }
    if (body.phone !== undefined) {
      const phone = body.phone ? internationalPhone(clean(body.phone, 40), (await getStoreIdentity()).country) : ''
      if (body.phone && !phone) return json({ error: 'This phone number looks incomplete, e.g. 70 123 456' }, { status: 400 })
      data.phone = phone || null
    }
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.newLink === true) data.token = newDriverToken()
    const driver = await db.driver.update({ where: { id }, data })
    await audit(actor.id, 'driver.updated', 'Driver', id, { ...data, token: data.token ? 'new link' : undefined })
    return json({ driver })
  } catch (error) { return routeError(error, 'Unable to save the driver', 400) }
}

// Delete a driver who no longer works for the store. Not while they still hold cash you haven't
// received (Cash received first). Their open orders go back to the delivery sheet without a
// driver; delivered orders keep "Delivered by ..." in their history (the order's driver link is
// cleared by the database, ON DELETE SET NULL).
export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const id = clean(new URL(req.url).searchParams.get('id'), 64)
    const driver = id ? await db.driver.findUnique({ where: { id }, select: { id: true, name: true } }) : null
    if (!driver) return json({ error: 'Driver not found' }, { status: 404 })
    const cash = await db.order.aggregate({ where: { driverId: id, cashCollected: { gt: 0 }, cashSettledAt: null }, _sum: { cashCollected: true }, _count: { _all: true } })
    if (cash._count._all > 0) return json({ error: `${driver.name} still has cash from ${cash._count._all} deliver${cash._count._all === 1 ? 'y' : 'ies'} to hand over. Tap "Cash received" first.` }, { status: 409 })
    const [open] = await db.$transaction([
      db.order.updateMany({ where: { driverId: id, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] } }, data: { driverId: null } }),
      db.driver.delete({ where: { id } }),
    ])
    await audit(actor.id, 'driver.deleted', 'Driver', id, { name: driver.name, openOrdersUnassigned: open.count })
    return json({ ok: true, openOrders: open.count })
  } catch (error) { return routeError(error, 'Unable to delete the driver', 400) }
}
