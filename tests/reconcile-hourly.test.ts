import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconcileDue } from '../lib/order-watch'

// The refund reconciliation shares the 15-minute cron, and each run wakes the database (the free plan's monthly
// allowance). It runs at the top of the hour only: see docs/refund-reconciliation-and-checkout-2026-11.md.

const read = (path: string) => readFileSync(path, 'utf8')

test('refund reconciliation is due at the top of the hour, and at no other quarter-hour', () => {
  assert.equal(reconcileDue(Date.UTC(2026, 10, 12, 9, 0)), true)
  assert.equal(reconcileDue(Date.UTC(2026, 10, 12, 0, 0)), true)
  assert.equal(reconcileDue(Date.UTC(2026, 10, 12, 9, 15)), false)
  assert.equal(reconcileDue(Date.UTC(2026, 10, 12, 9, 30)), false)
  assert.equal(reconcileDue(Date.UTC(2026, 10, 12, 9, 45)), false)
})

test('the Worker includes the reconciliation only when it is due, and the order watch cron is unchanged', () => {
  const worker = read('worker.ts')
  assert.match(worker, /if \(reconcileDue\(controller\.scheduledTime\)\) paths\.push\('\/api\/internal\/reconcile-refunds'\)/)
  assert.match(worker, /import \{ ORDER_WATCH_CRON, ORDER_WATCH_KEY, inQuietHours, parseWatch, reconcileDue \} from '\.\/lib\/order-watch'/)
  assert.match(read('lib/order-watch.ts'), /export const ORDER_WATCH_CRON = '\*\/15 \* \* \* \*'/)
})
