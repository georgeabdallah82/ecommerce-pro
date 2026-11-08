// Tills (registers) that cashiers open shifts on. A register belongs to a store location.

import { RegisterStatus } from '@prisma/client'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { ShiftError } from '@/lib/pos-shifts'

const NAME_MIN = 2
const NAME_MAX = 40

export async function createRegister(input: { name: unknown; locationId: unknown }, actorId: string) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new ShiftError(`The register name must be ${NAME_MIN} to ${NAME_MAX} characters.`)
  if (typeof input.locationId !== 'string' || !input.locationId) throw new ShiftError('Choose the location this register is at.')
  const location = await db.storeLocation.findUnique({ where: { id: input.locationId }, select: { id: true, name: true, status: true } })
  if (!location || location.status !== 'ACTIVE') throw new ShiftError('Choose an active location.')
  const existing = await db.register.findUnique({ where: { locationId_name: { locationId: location.id, name } } })
  if (existing) throw new ShiftError(`${location.name} already has a register called "${name}".`)
  const register = await db.register.create({ data: { name, locationId: location.id } })
  await audit(actorId, 'pos.register_created', 'Register', register.id, { name, locationId: location.id })
  return register
}

export async function setRegisterStatus(registerId: string, status: unknown, actorId: string) {
  if (status !== 'ACTIVE' && status !== 'INACTIVE') throw new ShiftError('Choose on or off.')
  const register = await db.register.findUnique({ where: { id: registerId }, select: { id: true } })
  if (!register) throw new ShiftError('That register does not exist.')
  if (status === 'INACTIVE') {
    const open = await db.cashierShift.findFirst({ where: { registerId, status: 'OPEN' }, select: { id: true } })
    if (open) throw new ShiftError('Close the shift on this register before switching it off.')
  }
  const updated = await db.register.update({ where: { id: registerId }, data: { status: status as RegisterStatus } })
  await audit(actorId, 'pos.register_status', 'Register', registerId, { status })
  return updated
}
