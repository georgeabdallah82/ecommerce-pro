// Database tests for choosing a customer at the till. Run only against a real Postgres:
//   POS_DB_TESTS=1 DATABASE_URL=postgresql://... npx tsx --test tests/pos-customer.db.test.ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, describe, it } from 'node:test'
import { db } from '../lib/prisma'
import { recordPosSale, SaleError } from '../lib/pos-sale'
import { openShift } from '../lib/pos-shifts'
import { searchTillCustomers } from '../lib/pos-customers'

const enabled = process.env.POS_DB_TESTS === '1'
const tag = randomUUID().slice(0, 8)

let cashier = ''
let customerId = ''
let staffId = ''
let productId = ''

describe('customer at the till', { skip: enabled ? false : 'set POS_DB_TESTS=1 and DATABASE_URL to run' }, () => {
  before(async () => {
    const location = await db.storeLocation.create({ data: { name: `Cust ${tag}`, handle: `cust-${tag}` } })
    const register = await db.register.create({ data: { name: 'Till', locationId: location.id } })
    cashier = (await db.user.create({ data: { name: 'Cashier', email: `cc-${tag}@test.local`, passwordHash: 'x', role: 'EDITOR' } })).id
    customerId = (await db.user.create({ data: { name: `Rima Haddad ${tag}`, email: `rima-${tag}@test.local`, phone: `+961 70 ${tag.slice(0, 6)}`, passwordHash: 'x', role: 'CUSTOMER' } })).id
    staffId = (await db.user.create({ data: { name: `Staff Member ${tag}`, email: `staff-${tag}@test.local`, passwordHash: 'x', role: 'ADMIN' } })).id
    await openShift({ registerId: register.id, openingCashCents: 0 }, cashier)
    productId = (await db.product.create({ data: { name: `Pen ${tag}`, slug: `pen-${tag}`, sku: `PEN-${tag}`, basePrice: 200, status: 'ACTIVE' } })).id
    await db.inventoryItem.create({ data: { productId, locationId: location.id, quantity: 20, reserved: 0 } })
  })

  it('attaches a store customer to the sale', async () => {
    const sale = await recordPosSale({
      idempotencyKey: `cust-${tag}-ok`,
      customerId,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', currency: 'USD', amount: 200 }],
    }, cashier)
    const order = (await db.order.findUnique({ where: { id: sale.orderId }, select: { userId: true } }))!
    assert.equal(order.userId, customerId)
  })

  it('refuses a staff account chosen as the customer, and saves nothing', async () => {
    await assert.rejects(recordPosSale({
      idempotencyKey: `cust-${tag}-staff`,
      customerId: staffId,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', currency: 'USD', amount: 200 }],
    }, cashier), SaleError)
    assert.equal(await db.order.count({ where: { idempotencyKey: `cust-${tag}-staff` } }), 0)
  })

  it('finds customers by part of the name or phone, and never returns staff', async () => {
    const byName = await searchTillCustomers(`rima haddad ${tag}`)
    assert.deepEqual(byName.map(c => c.id), [customerId])
    const byPhone = await searchTillCustomers(tag.slice(0, 6))
    assert.ok(byPhone.some(c => c.id === customerId))
    const staff = await searchTillCustomers(`staff member ${tag}`)
    assert.equal(staff.length, 0)
  })
})
