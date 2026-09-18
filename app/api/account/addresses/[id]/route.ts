import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { sanitizeAddressInput } from '@/lib/addresses'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params
    const existing = await db.address.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!existing) return json({ error: 'Address not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })

    const body = await req.json().catch(() => null)
    const data = sanitizeAddressInput(body)
    if (!data) return json({ error: 'First name, last name, address, city, and country are required' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })

    const address = await db.$transaction(async tx => {
      if (data.isDefault) await tx.address.updateMany({ where: { userId: user.id, NOT: { id } }, data: { isDefault: false } })
      return tx.address.update({ where: { id }, data })
    })
    return json({ address }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to update address' }, {
      status: message === 'UNAUTHORIZED' ? 401 : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params
    const existing = await db.address.findFirst({ where: { id, userId: user.id }, select: { id: true, isDefault: true } })
    if (!existing) return json({ error: 'Address not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })

    await db.address.delete({ where: { id } })

    if (existing.isDefault) {
      const next = await db.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
      if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    return json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to delete address' }, {
      status: message === 'UNAUTHORIZED' ? 401 : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
