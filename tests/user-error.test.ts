import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routeError } from '@/lib/api-error'
import { UserError, userError } from '@/lib/user-error'
import { reserveStock } from '@/lib/inventory'

const read = (path: string) => readFileSync(path, 'utf8')
const body = async (r: Response) => [r.status, (await r.json()).error] as const

test('a typed user error carries its message and status', () => {
  const e = userError('Not enough stock for Linen shirt', 409)
  assert.ok(e instanceof UserError)
  assert.ok(e instanceof Error)
  assert.equal(e.message, 'Not enough stock for Linen shirt')
  assert.equal(e.status, 409)
  assert.equal(userError('Quantity must be greater than zero').status, undefined, 'without a status, the route decides')
})

test('a route sends a typed error as it is, with the status the error carries', async () => {
  assert.deepEqual(await body(routeError(userError('Not enough stock for Linen shirt', 409), 'Unable to save', 400)), [409, 'Not enough stock for Linen shirt'])
})

test('stock and quantity errors are typed, so the checkout and manual-order routes can show them', async () => {
  await assert.rejects(reserveStock(null, {}, null, 0, 'ref'), (e: unknown) => e instanceof UserError && e.message === 'Quantity must be greater than zero')
  assert.match(read('lib/inventory.ts'), /throw userError\(`Not enough stock for \$\{product\.name\}`\)/)
})

test('the manual-order route sends only typed messages, and logs everything else behind a generic line', () => {
  const route = read('app/api/admin/orders/manual/route.ts')
  assert.match(route, /if \(e instanceof UserError\) return json\(\{ error: e\.message \}, \{ status: e\.status \?\? 400 \}\)/)
  assert.doesNotMatch(route, /e instanceof Error \? e\.message/, 'no raw error text reaches the browser')
  assert.match(route, /console\.error\('\[orders\/manual\] could not create the order:', e\)/)
  assert.match(route, /return json\(\{ error: 'The order could not be created\. Please try again\.' \}, \{ status: 500 \}\)/)
})
