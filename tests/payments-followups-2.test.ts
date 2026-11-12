import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { refundOutcome } from '../lib/refund-reconciliation'

const read = (path: string) => readFileSync(path, 'utf8')

// Amounts: the store's money is in minor units (cents). The gateway's refunded total is in major units, as it reports it.
test('a gateway that has refunded nothing records nothing', () => {
  assert.deepEqual(refundOutcome({ gatewayStatus: 'CAPTURED', gatewayRefunded: 100, alreadyRefunded: 0, pendingAmount: 10000, grandTotal: 10000 }), { settle: false })
})

test('a gateway total that does not cover the pending refund records nothing yet', () => {
  assert.deepEqual(refundOutcome({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 40, alreadyRefunded: 0, pendingAmount: 5000, grandTotal: 10000 }), { settle: false })
  assert.deepEqual(refundOutcome({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 30, alreadyRefunded: 3000, pendingAmount: 2000, grandTotal: 10000 }), { settle: false })
})

test('a gateway total that covers the pending refund records it, as partial or full by the order total', () => {
  assert.deepEqual(refundOutcome({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 50, alreadyRefunded: 0, pendingAmount: 5000, grandTotal: 10000 }), { settle: true, refundedMinor: 5000, paymentStatus: 'PARTIALLY_REFUNDED' })
  assert.deepEqual(refundOutcome({ gatewayStatus: 'REFUNDED', gatewayRefunded: 100, alreadyRefunded: 0, pendingAmount: 10000, grandTotal: 10000 }), { settle: true, refundedMinor: 10000, paymentStatus: 'REFUNDED' })
  assert.deepEqual(refundOutcome({ gatewayStatus: 'PARTIALLY_REFUNDED', gatewayRefunded: 50, alreadyRefunded: 3000, pendingAmount: 2000, grandTotal: 10000 }), { settle: true, refundedMinor: 5000, paymentStatus: 'PARTIALLY_REFUNDED' })
})

test('an excessive refund at the gateway counts as refunded, and a missing total counts as nothing', () => {
  assert.deepEqual(refundOutcome({ gatewayStatus: 'EXCESSIVELY_REFUNDED', gatewayRefunded: 100, alreadyRefunded: 0, pendingAmount: 10000, grandTotal: 10000 }), { settle: true, refundedMinor: 10000, paymentStatus: 'REFUNDED' })
  assert.deepEqual(refundOutcome({ gatewayStatus: 'REFUNDED', gatewayRefunded: Number.NaN, alreadyRefunded: 0, pendingAmount: 10000, grandTotal: 10000 }), { settle: false })
})

test('the scheduled reconciliation is an authenticated internal job, and the Worker runs it once an hour, on the 15-minute cron', () => {
  const route = read('app/api/internal/reconcile-refunds/route.ts')
  assert.match(route, /isInternalJobRequest\(req\)/)
  assert.match(route, /status: 401/)
  assert.match(read('worker.ts'), /paths\.push\('\/api\/internal\/reconcile-refunds'\)/)
  assert.match(read('wrangler.jsonc'), /"\*\/15 \* \* \* \*"/)
})

test('the reconciliation locks the order, runs in a transaction that cannot run partly, and restores the gift card as well as the coins', () => {
  const lib = read('lib/refund-reconciliation.ts')
  assert.match(lib, /await tx\.order\.update\(\{ where: \{ id: orderId \}, data: \{ updatedAt: new Date\(\) \} \}\)/)
  assert.match(lib, /\}, \{ requireTransaction: true \} as any\)/)
  assert.match(lib, /restoreGiftCardBalance\(tx, order\.id, redeemedGift, outcome\.refundedMinor, order\.grandTotal\)/)
})

test('the webhook records gateway refunds through the shared reconciliation, not a copy of its own', () => {
  const webhook = read('app/api/payments/areeba/webhook/route.ts')
  assert.match(webhook, /import \{ reconcileGatewayRefunds \} from '@\/lib\/refund-reconciliation'/)
  assert.doesNotMatch(webhook, /restoreCoinsForOrder|reconcileRefunds\(/)
})

test('an admin coin or store-credit adjustment runs as one transaction that cannot run partly, and answers 503 when it cannot', () => {
  for (const file of ['app/api/admin/customers/[id]/coins/route.ts', 'app/api/admin/customers/[id]/credit/route.ts']) {
    const source = read(file)
    assert.match(source, /\}, \{ requireTransaction: true \} as any\)/, `${file} must run its adjustment with requireTransaction`)
    assert.match(source, /name === 'TransactionUnavailableError'/, `${file} must answer an unavailable transaction with 503`)
    assert.doesNotMatch(source, /MongoDB/, `${file} must not describe the database as MongoDB`)
  }
})

test('checkout names each field by its label alone, and describes it by its hint or its error', () => {
  const page = read('app/checkout/page.tsx')
  for (const name of ['phone', 'email', 'firstName', 'lastName', 'city', 'line1']) {
    assert.match(page, new RegExp(`id="co-${name}-label"`), `${name} has a label id`)
    assert.match(page, new RegExp(`aria-labelledby="co-${name}-label"`), `${name} is named by its label`)
  }
  assert.match(page, /describedBy\('phone', true\)/)
  assert.match(page, /id=\{`co-\$\{name\}-error`\}/)
  assert.match(page, /aria-required="true"/)
})

test('the discount and gift card inputs take focus when they open', () => {
  const page = read('app/checkout/page.tsx')
  assert.match(page, /autoFocus placeholder=\{t\('Discount code'\)\}/)
  assert.match(page, /autoFocus placeholder=\{t\('Gift card code'\)\}/)
})
