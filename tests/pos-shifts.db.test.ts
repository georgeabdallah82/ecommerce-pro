// Database tests for shifts, cash movements and the closing count. Run only against a real Postgres:
//   POS_DB_TESTS=1 DATABASE_URL=postgresql://... npx tsx --test tests/pos-shifts.db.test.ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, describe, it } from 'node:test'
import { db } from '../lib/prisma'
import { recordPosSale, SaleError } from '../lib/pos-sale'
import { ShiftError, closeShift, currentShift, openShift, recordCashMovement, shiftExpectedCash } from '../lib/pos-shifts'
import { setRegisterStatus } from '../lib/pos-registers'

const enabled = process.env.POS_DB_TESTS === '1'
const tag = randomUUID().slice(0, 8)

let registerId = ''
let registerB = ''
let cashierA = ''
let cashierB = ''
let productId = ''

describe('shifts against the database', { skip: enabled ? false : 'set POS_DB_TESTS=1 and DATABASE_URL to run' }, () => {
  before(async () => {
    const location = await db.storeLocation.create({ data: { name: `Shifts ${tag}`, handle: `shifts-${tag}` } })
    registerId = (await db.register.create({ data: { name: 'Till 1', locationId: location.id } })).id
    registerB = (await db.register.create({ data: { name: 'Till 2', locationId: location.id } })).id
    cashierA = (await db.user.create({ data: { name: 'A', email: `a-${tag}@test.local`, passwordHash: 'x' } })).id
    cashierB = (await db.user.create({ data: { name: 'B', email: `b-${tag}@test.local`, passwordHash: 'x' } })).id
    const product = await db.product.create({ data: { name: `Soap ${tag}`, slug: `soap-${tag}`, sku: `SOAP-${tag}`, basePrice: 300, status: 'ACTIVE' } })
    productId = product.id
    await db.inventoryItem.create({ data: { productId, locationId: location.id, quantity: 50, reserved: 0 } })
  })

  it('opens one shift per cashier and one per register', async () => {
    const shift = await openShift({ registerId, openingCashCents: 2000 }, cashierA)
    assert.equal(shift.status, 'OPEN')
    await assert.rejects(openShift({ registerId: registerB, openingCashCents: 0 }, cashierA), ShiftError, 'a cashier cannot open a second shift')
    await assert.rejects(openShift({ registerId, openingCashCents: 0 }, cashierB), ShiftError, 'a register cannot have two open shifts')
    assert.equal((await currentShift(cashierA))?.id, shift.id)
  })

  it('refuses a switched-off register and an opening cash that is not a whole amount', async () => {
    await assert.rejects(openShift({ registerId: registerB, openingCashCents: 12.5 }, cashierB), ShiftError)
    await setRegisterStatus(registerB, 'INACTIVE', cashierB)
    await assert.rejects(openShift({ registerId: registerB, openingCashCents: 0 }, cashierB), ShiftError)
    await setRegisterStatus(registerB, 'ACTIVE', cashierB)
  })

  it('will not switch a register off while its shift is open', async () => {
    await assert.rejects(setRegisterStatus(registerId, 'INACTIVE', cashierB), ShiftError)
  })

  it('records cash in and out with a reason, and needs a shift to do it', async () => {
    await recordCashMovement({ kind: 'CASH_IN', amountCents: 10000, reason: 'Change float' }, cashierA)
    await recordCashMovement({ kind: 'CASH_OUT', amountCents: 5000, reason: 'Bank drop' }, cashierA)
    await assert.rejects(recordCashMovement({ kind: 'CASH_IN', amountCents: 100, reason: 'x' }, cashierA), ShiftError, 'reason too short')
    await assert.rejects(recordCashMovement({ kind: 'CASH_IN', amountCents: 100, reason: 'Float' }, cashierB), ShiftError, 'no shift')
  })

  it('expects the opening cash, plus cash sales and cash in, minus cash out', async () => {
    const shift = (await currentShift(cashierA))!
    await recordPosSale({
      idempotencyKey: `shift-${tag}-sale`,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', currency: 'USD', amount: 500 }],
    }, cashierA)
    // 2000 opening + 500 cash received (for a 300 item) - 200 change given + 10000 cash in - 5000 cash out
    assert.equal(await shiftExpectedCash(shift.id, shift.openingCashCents), 2000 + 500 - 200 + 10000 - 5000)
  })

  it('refuses a close with a difference and no note, then closes once with the note', async () => {
    const open = (await currentShift(cashierA))!
    const expected = await shiftExpectedCash(open.id, open.openingCashCents)
    await assert.rejects(closeShift({ countedCashCents: expected - 100, note: '' }, cashierA), ShiftError)
    const closed = await closeShift({ countedCashCents: expected - 100, note: 'Short by a coin roll' }, cashierA)
    assert.equal(closed.expectedCashCents, expected)
    assert.equal(closed.discrepancyCents, -100)
    await assert.rejects(closeShift({ countedCashCents: expected, note: '' }, cashierA), ShiftError, 'a closed shift cannot be closed again')
  })

  it('refuses a sale on a closed shift, and frees the register for the next cashier', async () => {
    await assert.rejects(recordPosSale({
      idempotencyKey: `shift-${tag}-after-close`,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', currency: 'USD', amount: 300 }],
    }, cashierA), SaleError)
    const next = await openShift({ registerId, openingCashCents: 0 }, cashierB)
    assert.equal(next.cashierId, cashierB)
  })
})
