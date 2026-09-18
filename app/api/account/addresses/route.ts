import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { MAX_ADDRESSES_PER_USER, sanitizeAddressInput } from '@/lib/addresses'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const data = sanitizeAddressInput(body)
    if (!data) return json({ error: 'First name, last name, address, city, and country are required' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })

    const count = await db.address.count({ where: { userId: user.id } })
    if (count >= MAX_ADDRESSES_PER_USER) return json({ error: `You can save up to ${MAX_ADDRESSES_PER_USER} addresses` }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })

    const makeDefault = data.isDefault || count === 0
    const address = await db.$transaction(async tx => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
      return tx.address.create({ data: { ...data, isDefault: makeDefault, userId: user.id } })
    })
    return json({ address }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to save address' }, {
      status: message === 'UNAUTHORIZED' ? 401 : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
