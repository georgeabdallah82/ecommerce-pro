import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { BEFORE_SENDING, assessRisk, riskSignals, type OtherOrder } from '@/lib/order-risk'

const order = (status: string, extra: Partial<OtherOrder> = {}): OtherOrder => ({ id: Math.random().toString(36).slice(2), status, wasShipped: false, problems: '', ...extra })
const refusedReport = '{"driverId":"d1","reason":"refused","note":""}'
const noAnswerReport = '{"driverId":"d1","reason":"no-answer","note":""}'

describe('risky order warning: what counts', () => {
  it('a parcel cancelled after it was sent out is a refusal', () => {
    assert.deepEqual(riskSignals([order('CANCELLED', { wasShipped: true })]), { refusals: 1, missed: 0, cancelled: 0, delivered: 0 })
  })

  it('a driver report of "customer refused" counts, even before staff cancel it', () => {
    assert.equal(riskSignals([order('SHIPPED', { problems: refusedReport })]).refusals, 1)
  })

  it('"not answering" is a missed delivery, not a refusal', () => {
    assert.deepEqual(riskSignals([order('SHIPPED', { problems: noAnswerReport })]), { refusals: 0, missed: 1, cancelled: 0, delivered: 0 })
  })

  it('an order that was delivered in the end never counts against the number', () => {
    const s = riskSignals([order('DELIVERED', { problems: noAnswerReport }), order('DELIVERED', { problems: refusedReport })])
    assert.deepEqual(s, { refusals: 0, missed: 0, cancelled: 0, delivered: 2 })
  })

  it('a refusal is counted once, even when it was reported and then cancelled', () => {
    const s = riskSignals([order('CANCELLED', { wasShipped: true, problems: refusedReport })])
    assert.equal(s.refusals, 1)
    assert.equal(s.cancelled, 0)
  })

  it('an order cancelled before it was sent out is only a cancellation', () => {
    assert.deepEqual(riskSignals([order('CANCELLED')]), { refusals: 0, missed: 0, cancelled: 1, delivered: 0 })
  })

  it('other reasons the driver gave (wrong address, another day) do not count', () => {
    assert.equal(assessRisk(riskSignals([order('SHIPPED', { problems: '{"reason":"address"}' }), order('SHIPPED', { problems: '{"reason":"later"}' })])), null)
  })
})

describe('risky order warning: how serious', () => {
  const sig = (p: Partial<ReturnType<typeof riskSignals>>) => ({ refusals: 0, missed: 0, cancelled: 0, delivered: 0, ...p })

  it('no history, or only good history: no warning', () => {
    assert.equal(assessRisk(sig({})), null)
    assert.equal(assessRisk(sig({ delivered: 4 })), null)
    assert.equal(assessRisk(sig({ delivered: 2, cancelled: 1 })), null)
  })

  it('one refused parcel is already high, and says how many orders were delivered', () => {
    const r = assessRisk(sig({ refusals: 1, delivered: 3 }))!
    assert.equal(r.level, 'high')
    assert.equal(r.headline, 'Call this customer before you prepare the order.')
    assert.deepEqual(r.reasons, ['Refused 1 earlier parcel'])
    assert.equal(r.context, '3 earlier orders delivered')
  })

  it('missing the driver twice is high; once is only worth a check', () => {
    assert.equal(assessRisk(sig({ missed: 2 }))!.level, 'high')
    const once = assessRisk(sig({ missed: 1 }))!
    assert.equal(once.level, 'medium')
    assert.match(once.headline, /quick call/)
    assert.deepEqual(once.reasons, ['Did not answer the driver 1 time'])
  })

  it('cancelling two orders, or cancelling when nothing was ever delivered, is a check', () => {
    assert.equal(assessRisk(sig({ cancelled: 2, delivered: 5 }))!.level, 'medium')
    const first = assessRisk(sig({ cancelled: 1 }))!
    assert.equal(first.level, 'medium')
    assert.equal(first.context, 'No earlier order delivered')
  })

  it('lists every reason, with plural words', () => {
    const r = assessRisk(sig({ refusals: 2, missed: 1, cancelled: 3 }))!
    assert.deepEqual(r.reasons, ['Refused 2 earlier parcels', 'Did not answer the driver 1 time', 'Cancelled 3 earlier orders'])
  })

  it('only orders that can still be stopped get a warning', () => {
    assert.deepEqual([...BEFORE_SENDING].sort(), ['CONFIRMED', 'PENDING', 'PROCESSING'])
  })
})

describe('risky order warning: shown where the owner looks', () => {
  const read = (path: string) => readFileSync(path, 'utf8')

  it('the orders list and the order page both get the warning', () => {
    assert.match(read('app/admin/orders/page.tsx'), /rows: await withRisk\(rows, store\.country\)/)
    assert.match(read('app/api/admin/orders/route.ts'), /rows: await withRisk\(rows, \(await getStoreIdentity\(\)\)\.country\)/)
    assert.match(read('app/admin/orders/[id]/page.tsx'), /BEFORE_SENDING\.has\(order\.status\) \? \(await riskForOrders/)
    assert.match(read('components/order-detail-admin.tsx'), /\{risk && <section/)
    assert.match(read('components/orders-admin-shopify.tsx'), /o\.risk \?/)
  })

  it('the phone notification for a new order carries it', () => {
    assert.match(read('app/api/checkout/route.ts'), /runInBackground\(riskNote\(order\.id[^\n]*\n\s*\.then\(note => sendNewOrderPush\(/)
    assert.doesNotMatch(read('app/api/checkout/route.ts'), /await\s+sendNewOrderPush\(/, 'checkout never waits for the push')
    assert.match(read('lib/push.ts'), /sendNewOrderPush\(order: \{[^}]*\}, note = ''\)/)
  })

  it('a failure in the check can never break the list or the order page', () => {
    assert.match(read('lib/order-risk.ts'), /catch \(error\) \{\n    console\.error\('\[orders\] risk check failed'/)
    assert.match(read('app/admin/orders/[id]/page.tsx'), /\.catch\(error => \{ console\.error\('\[orders\] risk check failed'/)
  })
})
