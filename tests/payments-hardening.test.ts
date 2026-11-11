import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TransactionUnavailableError, resetTransactionState, runInteractiveTransaction } from '../lib/prisma'
import { MAX_PROOFS_PER_ORDER } from '../lib/payment-proof'

const read = (path: string) => readFileSync(path, 'utf8')

// What Prisma throws when a transaction cannot start at all (an infrastructure failure, not a
// conflict between two writers).
const cannotStart = () => Object.assign(new Error('Transaction API error: unable to start a transaction'), { name: 'PrismaClientUnknownRequestError' })
const fakeClient = (behaviour: 'works' | 'cannot-start') => ({
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    if (behaviour === 'cannot-start') throw cannotStart()
    return callback({ marker: 'tx' })
  },
})

beforeEach(() => resetTransactionState())

test('a transaction that can run gives back its result', async () => {
  const result = await runInteractiveTransaction(fakeClient('works'), async tx => (tx as { marker: string }).marker, { requireTransaction: true })
  assert.equal(result, 'tx')
})

test('money that must not run one step at a time fails with a retry message when no transaction can start', async () => {
  let ran = false
  await assert.rejects(
    runInteractiveTransaction(fakeClient('cannot-start'), async () => { ran = true; return 'done' }, { requireTransaction: true }),
    error => error instanceof TransactionUnavailableError,
  )
  assert.equal(ran, false, 'none of the steps ran')
})

test('other work still falls back to running the steps one at a time', async () => {
  const result = await runInteractiveTransaction(fakeClient('cannot-start'), async () => 'fallback')
  assert.equal(result, 'fallback')
})

test('while the cooldown is on, money that must not run one step at a time is refused without trying again', async () => {
  // The first call finds no transaction and starts the cooldown.
  await runInteractiveTransaction(fakeClient('cannot-start'), async () => 'fallback')
  let attempts = 0
  const counting = { $transaction: async () => { attempts++; return 'never' } }
  await assert.rejects(runInteractiveTransaction(counting, async () => 'x', { requireTransaction: true }), error => error instanceof TransactionUnavailableError)
  assert.equal(attempts, 0)
})

test('checkout runs a real transaction when it spends wallet or coins, and answers 503 when it cannot', () => {
  const checkout = read('app/api/checkout/route.ts')
  assert.match(checkout, /const spendsWalletOrCoins = Boolean\(\(user\?\.id && requestedCoins > 0\) \|\| \(paymentMethod === PaymentMethod\.WALLET && grandTotal > 0\)\)/)
  assert.match(checkout, /\}, \{ requireTransaction: spendsWalletOrCoins \} as any\)/)
  assert.match(checkout, /if \(error instanceof TransactionUnavailableError\) return \{ message: error\.message, status: 503 \}/)
})

test('the payment webhook takes refund amounts from the gateway, never from its own body', () => {
  const webhook = read('app/api/payments/areeba/webhook/route.ts')
  assert.doesNotMatch(webhook, /body\.order\?\.totalRefundedAmount/)
  assert.doesNotMatch(webhook, /body\.order\?\.status/)
  assert.match(webhook, /reconcileGatewayRefunds\(order\.id, order\.orderNumber\)/)
  // The reconciliation itself (lib/refund-reconciliation.ts) asks the gateway, in a transaction that cannot run partly.
  const reconciliation = read('lib/refund-reconciliation.ts')
  assert.match(reconciliation, /areebaOrderRefunds\(orderNumber\)/)
  assert.match(reconciliation, /\}, \{ requireTransaction: true \} as any\)/)
})

test('one gateway read serves both the payment status and the refund totals', () => {
  const payments = read('lib/payments.ts')
  assert.match(payments, /async function fetchGatewayOrder\(orderId: string\)/)
  assert.match(payments, /export async function areebaOrderRefunds\(orderId: string\)/)
  assert.match(payments, /const \{ status \} = await fetchGatewayOrder\(orderId\)/)
})

test('a payment screenshot takes the order lock before the limit is counted', () => {
  const route = read('app/api/orders/payment-proof/route.ts')
  const lock = route.indexOf('await tx.order.update({ where: { id: order.id }, data: { updatedAt: new Date() } })')
  const count = route.indexOf('const count = await tx.paymentProof.count({ where: { orderId: order.id } })')
  assert.ok(lock > 0 && count > lock, 'the lock comes first, then the count')
  assert.match(route, /if \(count >= MAX_PROOFS_PER_ORDER\) return null/)
  assert.equal(MAX_PROOFS_PER_ORDER, 3)
})

test('the cookie banner publishes its height, and the checkout Place order bar sits above it', () => {
  assert.match(read('components/cookie-consent.tsx'), /setProperty\('--cookie-banner-height'/)
  assert.match(read('app/checkout/checkout.module.css'), /\.placeBar \{ position: sticky; bottom: calc\(var\(--cookie-banner-height, 0px\) \+ 8px\);/)
})
