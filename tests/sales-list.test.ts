import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { salesWhere, startOfDayIn } from '../lib/sales-list'

describe('start of a day in the store timezone', () => {
  it('starts Beirut days at 22:00 UTC the day before in November (UTC+2)', () => {
    assert.equal(startOfDayIn('2026-11-01', 'Asia/Beirut')?.toISOString(), '2026-10-31T22:00:00.000Z')
  })

  it('starts UTC days at midnight UTC', () => {
    assert.equal(startOfDayIn('2026-11-01', 'UTC')?.toISOString(), '2026-11-01T00:00:00.000Z')
  })

  it('refuses a date that is not a real calendar day', () => {
    assert.equal(startOfDayIn('2026-13-40', 'UTC'), null)
    assert.equal(startOfDayIn('yesterday', 'UTC'), null)
  })
})

describe('sales filters', () => {
  it('filters by channel, and ignores a channel that does not exist', () => {
    assert.equal(salesWhere({ channel: 'POS' }, 'UTC').channel, 'POS')
    assert.equal(salesWhere({ channel: 'ONLINE' }, 'UTC').channel, 'ONLINE')
    assert.equal(salesWhere({ channel: 'MARS' }, 'UTC').channel, undefined)
  })

  it('ignores an unknown order or payment status instead of matching nothing', () => {
    assert.equal(salesWhere({ status: 'LOST' }, 'UTC').status, undefined)
    assert.equal(salesWhere({ status: 'DELIVERED' }, 'UTC').status, 'DELIVERED')
    assert.equal(salesWhere({ payment: 'PAID' }, 'UTC').paymentStatus, 'PAID')
    assert.equal(salesWhere({ payment: 'NOPE' }, 'UTC').paymentStatus, undefined)
  })

  it('includes the whole of the "to" day', () => {
    const where = salesWhere({ from: '2026-11-01', to: '2026-11-03' }, 'UTC') as { createdAt: { gte: Date; lt: Date } }
    assert.equal(where.createdAt.gte.toISOString(), '2026-11-01T00:00:00.000Z')
    assert.equal(where.createdAt.lt.toISOString(), '2026-11-04T00:00:00.000Z')
  })

  it('finds orders that contain a product, and a customer\'s orders', () => {
    assert.deepEqual(salesWhere({ productId: 'p1' }, 'UTC').items, { some: { productId: 'p1' } })
    assert.equal(salesWhere({ customerId: 'u1' }, 'UTC').userId, 'u1')
  })

  it('searches the order number, email, phone and customer name, and ignores empty search', () => {
    const where = salesWhere({ q: '  rana  ' }, 'UTC') as { OR: Array<Record<string, unknown>> }
    assert.equal(where.OR.length, 4)
    assert.deepEqual(salesWhere({ q: '   ' }, 'UTC'), {})
  })
})
