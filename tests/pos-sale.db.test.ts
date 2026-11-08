// Database tests for the till's sale. They run only against a real Postgres database:
//   POS_DB_TESTS=1 DATABASE_URL=postgresql://... npx tsx --test tests/pos-sale.db.test.ts
// Without POS_DB_TESTS they are skipped, so the normal test run needs no database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { db, TransactionUnavailableError } from '../lib/prisma'
import { SaleError, recordPosSale } from '../lib/pos-sale'
import { ShiftStatus } from '@prisma/client'

const enabled = process.env.POS_DB_TESTS === '1'
const tag = randomUUID().slice(0, 8)
const key = (name: string) => `test-${tag}-${name}`

let locationId = ''
let registerId = ''
let cashierId = ''
let strangerId = ''
let productId = ''
let inventoryId = ''

async function stockOf() {
  const row = (await db.inventoryItem.findUnique({ where: { id: inventoryId }, select: { quantity: true, reserved: true } }))!
  return { quantity: row.quantity, reserved: row.reserved }
}

function sale(name: string, quantity: number, cashCents: number, cashier = cashierId) {
  return recordPosSale({
    idempotencyKey: key(name),
    items: [{ productId, quantity }],
    payments: [{ method: 'CASH', currency: 'USD', amount: cashCents }],
  }, cashier)
}

describe('till sale against the database', { skip: enabled ? false : 'set POS_DB_TESTS=1 and DATABASE_URL to run' }, () => {
  before(async () => {
    const location = await db.storeLocation.create({ data: { name: `Test ${tag}`, handle: `test-${tag}` } })
    locationId = location.id
    const register = await db.register.create({ data: { name: `Till ${tag}`, locationId } })
    registerId = register.id
    const cashier = await db.user.create({ data: { name: 'Cashier', email: `cashier-${tag}@test.local`, passwordHash: 'x' } })
    cashierId = cashier.id
    const stranger = await db.user.create({ data: { name: 'No shift', email: `stranger-${tag}@test.local`, passwordHash: 'x' } })
    strangerId = stranger.id
    await db.cashierShift.create({ data: { registerId, cashierId, openingCashCents: 0, status: ShiftStatus.OPEN } })
    const product = await db.product.create({
      data: { name: `Tissue ${tag}`, slug: `tissue-${tag}`, sku: `TIS-${tag}`, basePrice: 450, status: 'ACTIVE' },
    })
    productId = product.id
    const item = await db.inventoryItem.create({ data: { productId, locationId, quantity: 5, reserved: 0 } })
    inventoryId = item.id
  })

  after(async () => {
    // Test data only: each run uses its own tag, so nothing else is touched.
    await db.$disconnect?.()
  })

  it('records a cash sale, takes the stock once, and returns change', async () => {
    const result = await sale('happy', 2, 1000)
    assert.equal(result.replayed, false)
    assert.equal(result.grandTotalCents, 900)
    assert.equal(result.changeUsdCents, 100)
    const order = (await db.order.findUnique({ where: { id: result.orderId }, include: { paymentLines: true, items: true } }))!
    assert.equal(order.channel, 'POS')
    assert.equal(order.locationId, locationId)
    assert.equal(order.cashierId, cashierId)
    assert.equal(order.items[0].quantity, 2)
    assert.equal(order.items[0].unitPrice, 450)
    assert.equal(order.paymentLines.length, 1)
    assert.deepEqual(await stockOf(), { quantity: 3, reserved: 0 })
    const movements = await db.inventoryMovement.findMany({ where: { referenceId: result.orderNumber } })
    assert.ok(movements.some(m => m.type === 'SALE_FULFILLMENT' && m.quantity === 2), 'a fulfilment movement is in the ledger')
  })

  it('returns the first sale for a repeated key and takes no more stock', async () => {
    const first = await sale('repeat', 1, 450)
    const again = await recordPosSale({ idempotencyKey: key('repeat'), items: [{ productId, quantity: 1 }], payments: [{ method: 'CASH', currency: 'USD', amount: 450 }] }, cashierId)
    assert.equal(again.replayed, true)
    assert.equal(again.orderNumber, first.orderNumber)
    const count = await db.order.count({ where: { idempotencyKey: key('repeat') } })
    assert.equal(count, 1)
  })

  it('refuses a sale larger than the stock, and saves nothing', async () => {
    const before = await stockOf()
    await assert.rejects(sale('oversell', 999, 999999), (error: unknown) => error instanceof SaleError || error instanceof TransactionUnavailableError)
    assert.deepEqual(await stockOf(), before)
    assert.equal(await db.order.count({ where: { idempotencyKey: key('oversell') } }), 0)
  })

  it('refuses a payment that does not cover the total, and saves nothing', async () => {
    const before = await stockOf()
    await assert.rejects(
      recordPosSale({ idempotencyKey: key('short'), items: [{ productId, quantity: 1 }], payments: [{ method: 'CASH', currency: 'USD', amount: 100 }] }, cashierId),
      SaleError,
    )
    assert.deepEqual(await stockOf(), before)
    assert.equal(await db.order.count({ where: { idempotencyKey: key('short') } }), 0)
  })

  it('refuses a cashier who has no open shift', async () => {
    await assert.rejects(sale('no-shift', 1, 450, strangerId), SaleError)
    assert.equal(await db.order.count({ where: { idempotencyKey: key('no-shift') } }), 0)
  })

  it('lets two tills race for the last units without overselling', async () => {
    const before = await stockOf()
    const remaining = before.quantity - before.reserved
    const each = Math.floor(remaining / 2) + 1
    const results = await Promise.allSettled([sale('race-a', each, 999999), sale('race-b', each, 999999)])
    const won = results.filter(r => r.status === 'fulfilled').length
    assert.equal(won, 1, 'only one of the two sales can take the stock')
    const after = await stockOf()
    assert.ok(after.quantity >= 0 && after.reserved === 0, 'stock never goes negative')
    assert.equal(after.quantity, before.quantity - each)
  })

  it('saves one sale when the same key is submitted twice at the same moment', async () => {
    // Earlier tests used up the stock: put some back so this test is about the duplicate, not the count.
    await db.inventoryItem.update({ where: { id: inventoryId }, data: { quantity: { increment: 5 } } })
    const before = await stockOf()
    const body = { idempotencyKey: key('double-tap'), items: [{ productId, quantity: 1 }], payments: [{ method: 'CASH' as const, currency: 'USD' as const, amount: 450 }] }
    const [a, b] = await Promise.all([recordPosSale(body, cashierId), recordPosSale(body, cashierId)])
    assert.equal(a.orderNumber, b.orderNumber)
    assert.equal(await db.order.count({ where: { idempotencyKey: key('double-tap') } }), 1)
    assert.equal((await stockOf()).quantity, before.quantity - 1)
  })
})
