import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ordersBySupplier, supplierHealth, supplierKey } from '@/lib/suppliers'

describe('ordersBySupplier', () => {
  it('groups orders by supplier name, ignoring case, spaces and cancelled orders', () => {
    const stats = ordersBySupplier([
      { supplierName: ' Khoury  Trading ', status: 'RECEIVED', orderedAt: '2026-10-02T09:00:00Z', createdAt: '2026-10-01T09:00:00Z' },
      { supplierName: 'khoury trading', status: 'ORDERED', orderedAt: '2026-11-05T09:00:00Z', createdAt: '2026-11-04T09:00:00Z' },
      { supplierName: 'KHOURY TRADING', status: 'CANCELLED', orderedAt: '2026-11-09T09:00:00Z', createdAt: '2026-11-08T09:00:00Z' },
      { supplierName: null, status: 'DRAFT', orderedAt: null, createdAt: '2026-11-01T09:00:00Z' },
    ])
    assert.deepEqual(Object.keys(stats), [supplierKey('Khoury Trading')])
    const entry = stats[supplierKey('Khoury Trading')]
    assert.equal(entry.orders, 2)
    assert.equal(entry.open, 1)
    assert.equal(entry.lastOrderedAt, '2026-11-05T09:00:00.000Z')
  })

  it('counts draft, ordered and partly received orders as open', () => {
    const stats = ordersBySupplier([
      { supplierName: 'Abou Ali', status: 'DRAFT', orderedAt: null, createdAt: '2026-11-01T09:00:00Z' },
      { supplierName: 'Abou Ali', status: 'PARTIALLY_RECEIVED', orderedAt: '2026-11-02T09:00:00Z', createdAt: '2026-11-01T09:00:00Z' },
      { supplierName: 'Abou Ali', status: 'RECEIVED', orderedAt: '2026-11-03T09:00:00Z', createdAt: '2026-11-01T09:00:00Z' },
    ])
    assert.equal(stats[supplierKey('Abou Ali')].orders, 3)
    assert.equal(stats[supplierKey('Abou Ali')].open, 2)
  })

  it('uses the creation date for a draft that was never ordered', () => {
    const stats = ordersBySupplier([{ supplierName: 'Abou Ali', status: 'DRAFT', orderedAt: null, createdAt: '2026-11-01T09:00:00Z' }])
    assert.equal(stats[supplierKey('Abou Ali')].lastOrderedAt, '2026-11-01T09:00:00.000Z')
  })
})

describe('supplierHealth', () => {
  it('is ready for a complete Lebanese number', () => {
    assert.equal(supplierHealth('70 123 456', 'Lebanon'), 'ready')
    assert.equal(supplierHealth('+961 70 123 456', 'Lebanon'), 'ready')
  })
  it('asks for a number when there is none', () => {
    assert.equal(supplierHealth('', 'Lebanon'), 'no-number')
    assert.equal(supplierHealth('   ', 'Lebanon'), 'no-number')
  })
  it('flags a number that is too short to be real', () => {
    assert.equal(supplierHealth('12', 'Lebanon'), 'number-invalid')
  })
})
