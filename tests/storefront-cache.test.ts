import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTtlCache } from '../lib/storefront-cache'

function setup(ttlMs = 30_000, maxEntries = 100) {
  let clock = 1_000
  const cache = createTtlCache({ ttlMs, maxEntries, now: () => clock })
  return { cache, tick: (ms: number) => { clock += ms } }
}

test('reuses a result within the time limit and reloads after it', async () => {
  const { cache, tick } = setup()
  let loads = 0
  const load = async () => ({ n: ++loads })
  assert.deepEqual(await cache.get('k', load), { n: 1 })
  tick(29_999)
  assert.deepEqual(await cache.get('k', load), { n: 1 })
  tick(1)
  assert.deepEqual(await cache.get('k', load), { n: 2 })
  assert.equal(loads, 2)
})

type Row = { id: string; price: number; createdAt: Date }

test('one visitor changing the rows they got does not change what the next one sees', async () => {
  const { cache } = setup()
  const first = await cache.get<Row[]>('rows', async () => [{ id: 'a', price: 100, createdAt: new Date('2026-01-01') }])
  first[0].price = 1
  first.push({ id: 'b', price: 5, createdAt: new Date() })
  const second = await cache.get<Row[]>('rows', async () => { throw new Error('should be cached') })
  assert.equal(second.length, 1)
  assert.equal(second[0].price, 100)
  assert.ok(second[0].createdAt instanceof Date)
  second[0].price = 2
  const third = await cache.get<Row[]>('rows', async () => { throw new Error('should be cached') })
  assert.equal(third[0].price, 100)
})

test('a failed load is not kept', async () => {
  const { cache } = setup()
  await assert.rejects(cache.get('k', async () => { throw new Error('database down') }))
  assert.equal(cache.size(), 0)
  assert.deepEqual(await cache.get('k', async () => 'ok'), 'ok')
})

test('keeps at most the set number of entries, dropping the oldest', async () => {
  const { cache } = setup(30_000, 2)
  await cache.get('a', async () => 1)
  await cache.get('b', async () => 2)
  await cache.get('c', async () => 3)
  assert.equal(cache.size(), 2)
  let reloaded = false
  await cache.get('a', async () => { reloaded = true; return 1 })
  assert.ok(reloaded)
})

test('null results (a product that does not exist) are kept too', async () => {
  const { cache } = setup()
  let loads = 0
  assert.equal(await cache.get('missing', async () => { loads++; return null }), null)
  assert.equal(await cache.get('missing', async () => { loads++; return null }), null)
  assert.equal(loads, 1)
})
