// Database test for the cost copied onto each sold item. Run only against a real Postgres:
//   POS_DB_TESTS=1 DATABASE_URL=postgresql://... npx tsx --test tests/pos-cost.db.test.ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, describe, it } from 'node:test'
import { db } from '../lib/prisma'
import { recordPosSale } from '../lib/pos-sale'
import { openShift } from '../lib/pos-shifts'

const enabled = process.env.POS_DB_TESTS === '1'
const tag = randomUUID().slice(0, 8)

let cashier = ''
let productId = ''

describe('cost on sold items', { skip: enabled ? false : 'set POS_DB_TESTS=1 and DATABASE_URL to run' }, () => {
  before(async () => {
    const location = await db.storeLocation.create({ data: { name: `Cost ${tag}`, handle: `cost-${tag}` } })
    const register = await db.register.create({ data: { name: 'Till', locationId: location.id } })
    cashier = (await db.user.create({ data: { name: 'Cost', email: `cost-${tag}@test.local`, passwordHash: 'x' } })).id
    await openShift({ registerId: register.id, openingCashCents: 0 }, cashier)
    productId = (await db.product.create({ data: { name: `Mug ${tag}`, slug: `mug-${tag}`, sku: `MUG-${tag}`, basePrice: 1000, costPrice: 400, status: 'ACTIVE' } })).id
    await db.inventoryItem.create({ data: { productId, locationId: location.id, quantity: 10, reserved: 0 } })
  })

  it('copies the cost onto the sold line, and a later cost change does not rewrite it', async () => {
    const sale = await recordPosSale({
      idempotencyKey: `cost-${tag}-sale`,
      items: [{ productId, quantity: 2 }],
      payments: [{ method: 'CASH', currency: 'USD', amount: 2000 }],
    }, cashier)
    await db.product.update({ where: { id: productId }, data: { costPrice: 900 } })
    const order = (await db.order.findUnique({ where: { id: sale.orderId }, include: { items: true } }))!
    assert.equal(order.items[0].costPrice, 400)
    assert.equal(order.items[0].unitPrice, 1000)
  })

  it('leaves the cost empty when the product has none, rather than inventing one', async () => {
    await db.product.update({ where: { id: productId }, data: { costPrice: null } })
    const sale = await recordPosSale({
      idempotencyKey: `cost-${tag}-nocost`,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', currency: 'USD', amount: 1000 }],
    }, cashier)
    const order = (await db.order.findUnique({ where: { id: sale.orderId }, include: { items: true } }))!
    assert.equal(order.items[0].costPrice, null)
  })
})
