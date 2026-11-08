// Cashier shifts: opening, cash in and out, and the closing count. Every amount is USD cents.
// Cash taken in LBP is recorded on the sale but is not part of the USD drawer count yet.

import { CashMovementKind, ShiftStatus } from '@prisma/client'
import { db, runInteractiveTransaction } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { cashDiscrepancy, expectedShiftCash } from '@/lib/pos-payments'

export class ShiftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShiftError'
  }
}

const MAX_CENTS = 100_000_000_00 // $100,000,000 is far above any real drawer; guards typos

function wholeCents(value: unknown, label: string, { allowZero }: { allowZero: boolean }) {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isInteger(n) || n > MAX_CENTS || n < 0 || (!allowZero && n === 0)) throw new ShiftError(`${label} must be a whole amount.`)
  return n
}

export async function currentShift(cashierId: string) {
  return db.cashierShift.findFirst({
    where: { cashierId, status: ShiftStatus.OPEN },
    include: { register: { include: { location: { select: { name: true } } } } },
  })
}

export async function openShift(input: { registerId: unknown; openingCashCents: unknown }, cashierId: string) {
  if (typeof input.registerId !== 'string' || !input.registerId) throw new ShiftError('Choose a register.')
  const openingCashCents = wholeCents(input.openingCashCents, 'The opening cash', { allowZero: true })
  const shift = await runInteractiveTransaction(db, async tx => {
    const register = await tx.register.findUnique({ where: { id: input.registerId as string } })
    if (!register) throw new ShiftError('That register does not exist.')
    if (register.status !== 'ACTIVE') throw new ShiftError('That register is switched off.')
    const busyRegister = await tx.cashierShift.findFirst({ where: { registerId: register.id, status: ShiftStatus.OPEN } })
    if (busyRegister) throw new ShiftError('Another cashier already has a shift open on this register.')
    const mine = await tx.cashierShift.findFirst({ where: { cashierId, status: ShiftStatus.OPEN } })
    if (mine) throw new ShiftError('You already have a shift open. Close it first.')
    return tx.cashierShift.create({ data: { registerId: register.id, cashierId, openingCashCents } })
  }, { atomic: true })
  await audit(cashierId, 'pos.shift_opened', 'CashierShift', shift.id, { registerId: shift.registerId, openingCashCents })
  return shift
}

export async function recordCashMovement(input: { kind: unknown; amountCents: unknown; reason: unknown }, userId: string) {
  if (input.kind !== 'CASH_IN' && input.kind !== 'CASH_OUT') throw new ShiftError('Choose cash in or cash out.')
  const amountCents = wholeCents(input.amountCents, 'The amount', { allowZero: false })
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (reason.length < 3 || reason.length > 200) throw new ShiftError('Write a short reason (3 to 200 characters).')
  const shift = await currentShift(userId)
  if (!shift) throw new ShiftError('Open a shift first.')
  const movement = await db.cashMovement.create({
    data: { shiftId: shift.id, kind: input.kind as CashMovementKind, amountCents, reason, userId },
  })
  await audit(userId, `pos.cash_${input.kind === 'CASH_IN' ? 'in' : 'out'}`, 'CashierShift', shift.id, { amountCents, reason })
  return movement
}

/** What the drawer should hold now, from the shift's sales and cash movements. */
export async function shiftExpectedCash(shiftId: string, openingCashCents: number) {
  const orders = await db.order.findMany({
    where: { shiftId },
    select: { grandTotal: true, paymentLines: { select: { method: true, currency: true, usdCents: true } } },
  })
  let cashSalesCents = 0
  let changeGivenCents = 0
  for (const order of orders) {
    const usdCashLines = order.paymentLines.filter(line => line.method === 'CASH' && line.currency === 'USD')
    cashSalesCents += usdCashLines.reduce((sum, line) => sum + line.usdCents, 0)
    const paid = order.paymentLines.reduce((sum, line) => sum + line.usdCents, 0)
    const change = Math.max(0, paid - order.grandTotal)
    // Change is given in cash, so it only leaves the drawer when the sale had a cash payment.
    if (change > 0 && usdCashLines.length > 0) changeGivenCents += change
  }
  const movements = await db.cashMovement.groupBy({ by: ['kind'], where: { shiftId }, _sum: { amountCents: true } })
  const sumOf = (kind: CashMovementKind) => movements.find(m => m.kind === kind)?._sum.amountCents ?? 0
  return expectedShiftCash({
    openingCents: openingCashCents,
    cashSalesCents,
    changeGivenCents,
    cashInCents: sumOf(CashMovementKind.CASH_IN),
    cashOutCents: sumOf(CashMovementKind.CASH_OUT),
  })
}

/**
 * Closes the cashier's shift against the counted cash. A difference from the expected amount needs
 * a note, so it is always explained on the record.
 */
export async function closeShift(input: { countedCashCents: unknown; note: unknown }, cashierId: string) {
  const countedCashCents = wholeCents(input.countedCashCents, 'The counted cash', { allowZero: true })
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > 500) throw new ShiftError('The note is too long.')
  const shift = await currentShift(cashierId)
  if (!shift) throw new ShiftError('You have no open shift.')
  const expected = await shiftExpectedCash(shift.id, shift.openingCashCents)
  const discrepancy = cashDiscrepancy(countedCashCents, expected)
  if (discrepancy !== 0 && note.length < 3) throw new ShiftError(`The cash is ${discrepancy > 0 ? 'over' : 'short'} by ${(Math.abs(discrepancy) / 100).toFixed(2)} USD. Write a note explaining it before closing.`)

  // The status check is part of the update, so a shift can only be closed once.
  const closed = await db.cashierShift.updateMany({
    where: { id: shift.id, status: ShiftStatus.OPEN },
    data: { status: ShiftStatus.CLOSED, closedAt: new Date(), expectedCashCents: expected, countedCashCents, discrepancyCents: discrepancy, closeNote: note || null },
  })
  if (closed.count !== 1) throw new ShiftError('This shift was already closed.')
  await audit(cashierId, 'pos.shift_closed', 'CashierShift', shift.id, { expectedCashCents: expected, countedCashCents, discrepancyCents: discrepancy })
  return { shiftId: shift.id, expectedCashCents: expected, countedCashCents, discrepancyCents: discrepancy }
}
