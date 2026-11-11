import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routeError } from '../lib/api-error'
import { startInvoicePayment } from '../lib/invoice-payment'
import { readProofForm } from '../lib/payment-proof'
import { TransactionUnavailableError } from '../lib/prisma'

const read = (path: string) => readFileSync(path, 'utf8')
const count = (source: string, pattern: RegExp) => (source.match(pattern) || []).length

// The start of an invoice's online payment: the store's own record first, then the gateway session, then the session
// saved on that record. A failed start is undone, and the undo never hides the error that started it.
test('an invoice payment is recorded before the gateway is asked for a session, and the session is saved on that record', async () => {
  const calls: string[] = []
  const session = await startInvoicePayment({
    recordPending: async () => { calls.push('record'); return { id: 'pay_1' } },
    createSession: async () => { calls.push('session'); return { provider: 'areeba_mpgs', externalId: 'sess_1', status: 'pending' } },
    saveSession: async (paymentId, saved) => { calls.push(`save:${paymentId}:${saved.externalId}`) },
    undo: async () => { calls.push('undo') },
  })
  assert.equal(session.externalId, 'sess_1')
  assert.deepEqual(calls, ['record', 'session', 'save:pay_1:sess_1'])
})

test('a gateway that refuses the session undoes the start, saves nothing, and passes its error on', async () => {
  const undone: unknown[] = []
  let saved = false
  await assert.rejects(startInvoicePayment({
    recordPending: async () => ({ id: 'pay_2' }),
    createSession: async () => { throw new Error('gateway unavailable') },
    saveSession: async () => { saved = true },
    undo: async state => { undone.push(state) },
  }), /gateway unavailable/)
  assert.equal(saved, false)
  assert.deepEqual(undone, [{ paymentId: 'pay_2', sessionCreated: false }])
})

test('when saving a session fails after the gateway created it, the record stays pending so a payment on that session is still matched', async () => {
  const undone: unknown[] = []
  await assert.rejects(startInvoicePayment({
    recordPending: async () => ({ id: 'pay_3' }),
    createSession: async () => ({ provider: 'areeba_mpgs', externalId: 'sess_3', status: 'pending' }),
    saveSession: async () => { throw new Error('write failed') },
    undo: async state => { undone.push(state) },
  }), /write failed/)
  assert.deepEqual(undone, [{ paymentId: 'pay_3', sessionCreated: true }])
})

test('a failure to record the payment stops the start before any gateway call', async () => {
  let asked = false
  const undone: unknown[] = []
  await assert.rejects(startInvoicePayment({
    recordPending: async () => { throw new Error('no database') },
    createSession: async () => { asked = true; return { provider: 'areeba_mpgs', status: 'pending' } },
    saveSession: async () => {},
    undo: async state => { undone.push(state) },
  }), /no database/)
  assert.equal(asked, false)
  assert.deepEqual(undone, [{ paymentId: null, sessionCreated: false }])
})

test('an undo that also fails does not hide the error that started it', async () => {
  await assert.rejects(startInvoicePayment({
    recordPending: async () => ({ id: 'pay_5' }),
    createSession: async () => { throw new Error('gateway refused') },
    saveSession: async () => {},
    undo: async () => { throw new Error('undo failed') },
  }), /gateway refused/)
})

// The upload reader keeps no more than its limit of a body, whatever Content-Length says.
test('the upload reader parses a form under the limit, and refuses a body over it', async () => {
  const form = new FormData()
  form.append('orderNumber', '1042')
  form.append('file', new Blob([new Uint8Array(64)], { type: 'image/png' }), 'proof.png')
  const request = () => new Request('http://localhost/api/orders/payment-proof', { method: 'POST', body: form })
  const parsed = await readProofForm(request(), 100_000)
  if (!(parsed instanceof FormData)) assert.fail('a form under the limit should parse')
  assert.equal(parsed.get('orderNumber'), '1042')
  assert.equal(await readProofForm(request(), 50), 'too-big')
  assert.equal(await readProofForm(new Request('http://localhost/api/orders/payment-proof', { method: 'POST' }), 100), null)
})

// A write that could not run as one transaction is a retry, not a server error.
test('a write that could not run as one transaction answers 503 with the retry message', async () => {
  const reply = routeError(new TransactionUnavailableError(), 'Unable to save', 400)
  assert.equal(reply.status, 503)
  assert.match((await reply.json()).error, /Please try again in a moment/)
})

test('every step that restores coins or gift cards runs as one transaction that cannot run one step at a time', () => {
  const expectations: Array<[string, number]> = [
    ['app/api/admin/refunds/route.ts', 2],
    ['app/api/admin/returns/route.ts', 1],
    ['app/api/admin/returns/[id]/route.ts', 1],
    ['app/api/admin/order-edits/[id]/route.ts', 1],
    ['app/api/admin/orders/route.ts', 1],
    ['app/api/checkout/route.ts', 1],
    ['app/api/internal/release-expired-reservations/route.ts', 1],
    ['app/api/invoice/[id]/pay/route.ts', 1],
    ['lib/returns.ts', 1],
    ['lib/payment-outcome.ts', 1],
    ['lib/draft-orders.ts', 1],
  ]
  for (const [file, minimum] of expectations) {
    assert.ok(count(read(file), /requireTransaction: true/g) >= minimum, `${file} must run its restore transaction with requireTransaction`)
  }
})

test('the refund routes that can run out of transaction answer 503 with the retry message', () => {
  for (const file of ['app/api/admin/refunds/route.ts', 'app/api/admin/returns/route.ts', 'app/api/admin/returns/[id]/route.ts', 'lib/api-error.ts']) {
    assert.match(read(file), /name === 'TransactionUnavailableError'/, `${file} must map the error to 503`)
  }
})

test('a manual or wallet refund is prepared and recorded in one transaction, so none of it is kept when that transaction cannot run', () => {
  const refunds = read('app/api/admin/refunds/route.ts')
  assert.match(refunds, /if \(prepared\.provider === 'manual' \|\| prepared\.provider === 'wallet'\) return \{ prepared, done: await applyRefund\(tx, prepared\)/)
})

test('a gateway refund that the store cannot record is never marked failed, because the gateway has already refunded it', () => {
  const returns = read('lib/returns.ts')
  assert.equal(count(returns, /status: 'refund_failed'/g), 1, 'the refund is marked failed only in the gateway step')
  assert.match(returns, /was accepted but not recorded; it stays pending/)
  assert.match(read('app/api/admin/refunds/route.ts'), /it stays pending until the gateway confirms it/i)
})

test('the webhook matches a payment record without its session id, and asks the gateway by the order number', () => {
  const webhook = read('app/api/payments/areeba/webhook/route.ts')
  assert.doesNotMatch(webhook, /!transaction\?\.externalId/)
  assert.match(webhook, /getPaymentStatus\(transaction\.externalId \?\? '', orderNumber\)/)
})

test('a cancelled checkout restores its coins and gift card in the same transaction that cancels it', () => {
  const checkout = read('app/api/checkout/route.ts')
  const compensation = checkout.slice(checkout.indexOf('} catch (paymentError) {'))
  assert.match(compensation, /await restoreCheckoutCoins\(tx, order\.id, order\.userId\)/)
  assert.match(compensation, /await restoreCheckoutGiftCard\(tx, order\.id, order\.grandTotal\)/)
  assert.ok(compensation.indexOf('restoreCheckoutCoins(tx') < compensation.indexOf("status: 'CANCELLED'"), 'the restores come with the cancellation')
  assert.doesNotMatch(checkout, /await restoreCheckoutCoins\(order\.id/)
})

test('the invoice payment starts through its own record, and a failed start marks that record failed only before a session exists', () => {
  const route = read('app/api/invoice/[id]/pay/route.ts')
  assert.match(route, /startInvoicePayment\(/)
  assert.match(route, /This invoice cannot be paid online right now/)
  assert.match(route, /if \(paymentId && !sessionCreated\) await tx\.paymentTransaction\.update\(\{ where: \{ id: paymentId \}, data: \{ status: 'failed' \} \}\)/)
  assert.ok(route.indexOf('recordPending:') < route.indexOf('createSession:'), 'the record is written before the gateway is asked')
})

test('an upload is refused before its body is read when its address is over the limit, and the order limit is charged only after ownership is proved', () => {
  const route = read('app/api/orders/payment-proof/route.ts')
  const addressLimit = route.indexOf('payment-proof:ip:')
  const bodyRead = route.indexOf('readProofForm(req, FORM_LIMIT)')
  const ownership = route.indexOf('canViewOrder(order')
  const orderLimit = route.indexOf('payment-proof:order:')
  assert.ok(addressLimit > 0 && addressLimit < bodyRead, 'the address limit comes before the body is read')
  assert.ok(ownership > 0 && orderLimit > ownership, 'the order limit comes after the ownership check')
})

test('the expiry job releases each order on its own, so one order that cannot be released does not stop the others', () => {
  const cron = read('app/api/internal/release-expired-reservations/route.ts')
  assert.match(cron, /failed \+= 1/)
  assert.match(cron, /Response\.json\(\{ released, failed, checked: candidates\.length \}\)/)
})
