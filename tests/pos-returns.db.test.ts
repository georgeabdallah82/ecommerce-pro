// Database tests for returns at the till. Run only against a real Postgres:
//   POS_DB_TESTS=1 DATABASE_URL=postgresql://... npx tsx --test tests/pos-returns.db.test.ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, describe, it } from 'node:test'
import { db } from '../lib/prisma'
import { recordPosSale } from '../lib/pos-sale'
import { closeShift, currentShift, openShift, shiftExpectedCash } from '../lib/pos-shifts'
import { findReceiptForReturn, recordPosReturn, ReturnError } from '../lib/pos-returns'

const enabled = process.env.POS_DB_TESTS === '1'
const tag = randomUUID().slice(0, 8)
const key = (name: string) => `ret-${tag}-${name}`

let locationId = ''
let registerId = ''
let cashier = ''
let nobody = ''
let productId = ''
let inventoryId = ''

async function stockOf() {
  const row = (await db.inventoryItem.findUnique({ where: { id: inventoryId }, select: { quantity: true, reserved: true } }))!
  return row.quantity - row.reserved
}

async function sell(name: string, quantity: number, cashCents: number) {
  return recordPosSale({
    idempotencyKey: key(name),
    items: [{ productId, quantity }],
    payments: [{ method: 'CASH', currency: 'USD', amount: cashCents }],
  }, cashier)
}

async function line(orderNumber: string) {
  const receipt = (await findReceiptForReturn(orderNumber))!
  return receipt.items[0]
}

describe('till returns against the database', { skip: enabled ? false : 'set POS_DB_TESTS=1 and DATABASE_URL to run' }, () => {
  before(async () => {
    const location = await db.storeLocation.create({ data: { name: `Returns ${tag}`, handle: `returns-${tag}` } })
    locationId = location.id
    registerId = (await db.register.create({ data: { name: 'Till', locationId } })).id
    cashier = (await db.user.create({ data: { name: 'Cashier', email: `ret-${tag}@test.local`, passwordHash: 'x' } })).id
    nobody = (await db.user.create({ data: { name: 'Nobody', email: `ret-none-${tag}@test.local`, passwordHash: 'x' } })).id
    await openShift({ registerId, openingCashCents: 0 }, cashier)
    const product = await db.product.create({ data: { name: `Lamp ${tag}`, slug: `lamp-${tag}`, sku: `LAMP-${tag}`, basePrice: 1000, status: 'ACTIVE' } })
    productId = product.id
    inventoryId = (await db.inventoryItem.create({ data: { productId, locationId, quantity: 20, reserved: 0 } })).id
  })

  it('finds a receipt and shows how many units can still be returned', async () => {
    const sale = await sell('find', 3, 3000)
    const receipt = (await findReceiptForReturn(sale.orderNumber))!
    assert.equal(receipt.items[0].returnable, 3)
  })

  it('returns a sellable unit: stock goes back, the refund is recorded, and the drawer pays it out', async () => {
    const sale = await sell('sellable', 1, 1000)
    const stockBefore = await stockOf()
    const shift = (await currentShift(cashier))!
    const drawerBefore = await shiftExpectedCash(shift.id, shift.openingCashCents)
    const result = await recordPosReturn({
      receiptNumber: sale.orderNumber, reason: 'Wrong colour', refundMethod: 'CASH',
      lines: [{ orderItemId: (await line(sale.orderNumber)).orderItemId, quantity: 1, condition: 'SELLABLE' }],
    }, cashier)
    assert.equal(result.refundCents, 1000)
    assert.equal(result.restocked, 1)
    assert.equal(await stockOf(), stockBefore + 1)
    const movement = await db.inventoryMovement.findFirst({ where: { referenceId: sale.orderNumber, type: 'RETURN' } })
    assert.equal(movement?.quantity, 1)
    assert.equal(await shiftExpectedCash(shift.id, shift.openingCashCents), drawerBefore - 1000)
  })

  it('records a damaged unit on the return without putting it back into stock', async () => {
    const sale = await sell('damaged', 1, 1000)
    const stockBefore = await stockOf()
    await recordPosReturn({
      receiptNumber: sale.orderNumber, reason: 'Broken on arrival', refundMethod: 'CARD',
      lines: [{ orderItemId: (await line(sale.orderNumber)).orderItemId, quantity: 1, condition: 'DAMAGED' }],
    }, cashier)
    assert.equal(await stockOf(), stockBefore)
    const receipt = (await findReceiptForReturn(sale.orderNumber))!
    assert.equal(receipt.items[0].returnable, 0)
  })

  it('refuses more units than the receipt can still return, and changes nothing', async () => {
    const sale = await sell('over', 2, 2000)
    const stockBefore = await stockOf()
    const item = await line(sale.orderNumber)
    await assert.rejects(recordPosReturn({
      receiptNumber: sale.orderNumber, reason: 'Too many', refundMethod: 'CASH',
      lines: [{ orderItemId: item.orderItemId, quantity: 3, condition: 'SELLABLE' }],
    }, cashier), ReturnError)
    assert.equal(await stockOf(), stockBefore)
    assert.equal((await findReceiptForReturn(sale.orderNumber))!.items[0].returnable, 2)
  })

  it('shares a receipt discount out in the refund', async () => {
    // 1000 of items with 100 off: 900 paid. Returning the one item refunds 900.
    const sale = await recordPosSale({
      idempotencyKey: key('discount'),
      items: [{ productId, quantity: 1 }],
      discountCents: 100,
      payments: [{ method: 'CASH', currency: 'USD', amount: 900 }],
    }, cashier)
    const result = await recordPosReturn({
      receiptNumber: sale.orderNumber, reason: 'Changed mind', refundMethod: 'CASH',
      lines: [{ orderItemId: (await line(sale.orderNumber)).orderItemId, quantity: 1, condition: 'SELLABLE' }],
    }, cashier)
    assert.equal(result.refundCents, 900)
  })

  it('marks the receipt fully refunded once every unit is back', async () => {
    const sale = await sell('full', 1, 1000)
    await recordPosReturn({
      receiptNumber: sale.orderNumber, reason: 'Not needed', refundMethod: 'CASH',
      lines: [{ orderItemId: (await line(sale.orderNumber)).orderItemId, quantity: 1, condition: 'SELLABLE' }],
    }, cashier)
    const order = (await db.order.findUnique({ where: { orderNumber: sale.orderNumber }, select: { paymentStatus: true } }))!
    assert.equal(order.paymentStatus, 'REFUNDED')
  })

  it('lets two returns race for the last unit without returning more than was sold', async () => {
    const sale = await sell('race', 1, 1000)
    const item = await line(sale.orderNumber)
    const attempt = (reason: string) => recordPosReturn({
      receiptNumber: sale.orderNumber, reason, refundMethod: 'CASH',
      lines: [{ orderItemId: item.orderItemId, quantity: 1, condition: 'SELLABLE' }],
    }, cashier)
    const results = await Promise.allSettled([attempt('first try'), attempt('second try')])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal((await findReceiptForReturn(sale.orderNumber))!.items[0].returnable, 0)
  })

  it('refuses a return from a cashier who has no open shift', async () => {
    const sale = await sell('no-shift', 1, 1000)
    await assert.rejects(recordPosReturn({
      receiptNumber: sale.orderNumber, reason: 'No shift here', refundMethod: 'CASH',
      lines: [{ orderItemId: (await line(sale.orderNumber)).orderItemId, quantity: 1, condition: 'SELLABLE' }],
    }, nobody), ReturnError)
  })

  it('keeps the drawer count right after the shift closes', async () => {
    const shift = (await currentShift(cashier))!
    const expected = await shiftExpectedCash(shift.id, shift.openingCashCents)
    const closed = await closeShift({ countedCashCents: expected, note: '' }, cashier)
    assert.equal(closed.discrepancyCents, 0)
  })
})
