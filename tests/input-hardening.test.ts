import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { SqlQuery, Transaction } from '@prisma/driver-adapter-utils'
import { nulFreeTransaction, withoutNul } from '@/lib/prisma'

// Bad input answered as bad input, not as a server error (docs/input-hardening-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const query = (...args: unknown[]): SqlQuery => ({ sql: 'SELECT $1', args, argTypes: [] })

describe('a NUL character never reaches the database', () => {
  it('is dropped from text values and lists of text, and nothing else changes', () => {
    const bytes = new Uint8Array([0, 1, 2])
    const when = new Date(0)
    const cleaned = withoutNul(query('a\u0000b@example.com', ['x\u0000', 'y'], 5, null, bytes, when, true))
    assert.deepEqual(cleaned.args, ['ab@example.com', ['x', 'y'], 5, null, bytes, when, true])
    assert.equal(cleaned.args[4], bytes, 'binary values are passed through as they are')
    assert.equal(cleaned.sql, 'SELECT $1')
    const clean = query('plain', 1)
    assert.equal(withoutNul(clean), clean, 'a query without a NUL is passed on unchanged')
  })
  it('also inside a transaction, which otherwise behaves as itself', async () => {
    const seen: unknown[][] = []
    const calls: string[] = []
    const tx = {
      provider: 'postgres', adapterName: 'test', options: { usePhantomQuery: false },
      async queryRaw(this: { provider: string }, q: SqlQuery) { assert.equal(this.provider, 'postgres'); seen.push(q.args); return { columnNames: [], columnTypes: [], rows: [] } },
      async executeRaw(q: SqlQuery) { seen.push(q.args); return 1 },
      async commit() { calls.push('commit') },
      async rollback() { calls.push('rollback') },
    } as unknown as Transaction
    const wrapped = nulFreeTransaction(tx)
    await wrapped.queryRaw(query('a\u0000'))
    assert.equal(await wrapped.executeRaw(query(['b\u0000'])), 1)
    await wrapped.commit(); await wrapped.rollback()
    assert.deepEqual(seen, [['a'], [['b']]])
    assert.deepEqual(calls, ['commit', 'rollback'])
    assert.equal(wrapped.options, tx.options)
    assert.equal(wrapped.provider, 'postgres')
  })
  it('is how every query and transaction reaches the database', () => {
    const prisma = read('lib/prisma.ts')
    assert.match(prisma, /queryRaw: async query => \(await queryConnection\(\)\)\.queryRaw\(withoutNul\(query\)\)/)
    assert.match(prisma, /executeRaw: async query => \(await queryConnection\(\)\)\.executeRaw\(withoutNul\(query\)\)/)
    assert.match(prisma, /startTransaction: async isolationLevel => nulFreeTransaction\(await \(await poolConnection\(\)\)\.startTransaction\(isolationLevel\)\)/)
  })
})

describe('a body of null is read like an empty one', () => {
  it('in the customer routes that read fields straight from the body', () => {
    for (const path of ['app/api/account/delete/route.ts', 'app/api/account/password/route.ts', 'app/api/account/orders/[orderNumber]/return/route.ts', 'app/api/account/push/route.ts']) {
      assert.match(read(path), /const body = \(await req\.json\(\)\.catch\(\(\) => null\)\) \?\? \{\}/, path)
      assert.doesNotMatch(read(path), /const body = await req\.json\(\)\.catch\(\(\) => \(\{\}\)\)/, path)
    }
  })
})
