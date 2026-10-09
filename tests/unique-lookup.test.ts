import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { uniqueWhereAsFilter } from '@/lib/prisma'

// Unique lookups are sent to the shared Prisma client as findFirst (findUnique calls get batched
// across requests). The filter must never match more than findUnique would have.
describe('lib/prisma uniqueWhereAsFilter', () => {
  it('keeps a single unique key as it is', () => {
    assert.deepEqual(uniqueWhereAsFilter({ id: 'u1' }), { id: 'u1' })
    assert.deepEqual(uniqueWhereAsFilter({ email: 'a@b.c' }), { email: 'a@b.c' })
  })

  it('keeps extra filters next to the unique key', () => {
    assert.deepEqual(uniqueWhereAsFilter({ id: 'p1', status: 'ACTIVE' }), { id: 'p1', status: 'ACTIVE' })
  })

  it('turns a compound key into its fields', () => {
    assert.deepEqual(uniqueWhereAsFilter({ userId_productId: { userId: 'u1', productId: 'p1' } }), { userId: 'u1', productId: 'p1' })
    assert.deepEqual(uniqueWhereAsFilter({ namespace_key_ownerType: { namespace: 'n', key: 'k', ownerType: 'PRODUCT' } }), { namespace: 'n', key: 'k', ownerType: 'PRODUCT' })
  })

  it('refuses a missing key instead of matching any row', () => {
    assert.equal(uniqueWhereAsFilter({ id: undefined }), null)
    assert.equal(uniqueWhereAsFilter({ id: null }), null)
    assert.equal(uniqueWhereAsFilter({}), null)
    assert.equal(uniqueWhereAsFilter(undefined), null)
    assert.equal(uniqueWhereAsFilter({ userId_productId: { userId: 'u1', productId: undefined } }), null)
    assert.equal(uniqueWhereAsFilter({ userId_productId: { userId: 'u1', productId: null } }), null)
  })

  it('leaves objects that are not compound keys alone', () => {
    const createdAt = new Date('2026-01-01')
    assert.deepEqual(uniqueWhereAsFilter({ id: 'o1', createdAt }), { id: 'o1', createdAt })
    assert.deepEqual(uniqueWhereAsFilter({ userId_productId: { userId: 'u1' } }), { userId_productId: { userId: 'u1' } })
  })
})
