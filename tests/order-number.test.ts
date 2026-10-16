import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { FIRST_ORDER_NUMBER, newOrderNumber, nextOrderNumber } from '@/lib/order-number'

// A stand-in for the database's $queryRaw: answers the counter statement like Postgres would.
function fakeDb(answer: () => unknown) {
  const calls: string[] = []
  return { calls, $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { calls.push(strings.join('?') + JSON.stringify(values)); return answer() as any } }
}

describe('nextOrderNumber', () => {
  it('hands out short running numbers from the counter: 1001, 1002, ...', async () => {
    let value = FIRST_ORDER_NUMBER - 1
    const db = fakeDb(() => [{ value: ++value }])
    assert.equal(await nextOrderNumber(db), '1001')
    assert.equal(await nextOrderNumber(db), '1002')
    // One statement that both creates the counter (at 1001) and raises it, so two orders at the
    // same moment can't share a number.
    assert.match(db.calls[0], /INSERT INTO "Counter".*ON CONFLICT \("name"\) DO UPDATE SET "value" = "Counter"\."value" \+ 1.*RETURNING "value"/s)
    assert.match(db.calls[0], /\["order",1001\]/)
  })

  it('never blocks an order: falls back to the long format if the counter fails or answers oddly', async () => {
    const original = console.error
    console.error = () => {}
    try {
      assert.match(await nextOrderNumber(fakeDb(() => { throw new Error('relation "Counter" does not exist') })), /^ORD-/)
    } finally { console.error = original }
    assert.match(await nextOrderNumber(fakeDb(() => [])), /^ORD-/)
    assert.match(await nextOrderNumber(fakeDb(() => [{ value: 'x' }])), /^ORD-/)
    assert.equal(await nextOrderNumber(fakeDb(() => [{ value: 1234n }])), '1234')
  })

  it('every way of creating an order uses the counter', () => {
    for (const file of ['app/api/checkout/route.ts', 'app/api/admin/orders/manual/route.ts', 'lib/draft-orders.ts']) {
      const source = readFileSync(file, 'utf8')
      assert.match(source, /await nextOrderNumber\(\)/, file)
      assert.doesNotMatch(source, /newOrderNumber\(/, file)
    }
  })

  it('the migration creates the counter so the first new order is 1001', () => {
    const sql = readFileSync('prisma/migrations/20261017000000_order_counter/migration.sql', 'utf8')
    assert.match(sql, /CREATE TABLE "Counter"/)
    assert.match(sql, /VALUES \('order', 1000,/)
    assert.doesNotMatch(sql, /\b(DROP|DELETE|UPDATE|ALTER TABLE "Order")\b/)
  })
})

describe('newOrderNumber (fallback)', () => {
  it('is ORD-<time>-<4 readable characters> with no stray punctuation', () => {
    for (let i = 0; i < 200; i++) assert.match(newOrderNumber(), /^ORD-[0-9A-Z]+-[A-HJ-NP-Z2-9]{4}$/)
    assert.ok(newOrderNumber(1790961558709).startsWith('ORD-MUR89QYD-'))
  })
})
