import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  DEFAULT_WAIT_MINUTES, MAX_WAIT_MINUTES, MIN_WAIT_MINUTES, ORDER_WATCH_CRON, checkoutAlertText, checkoutFailureKind, dueOrders, inQuietHours,
  nextWatch, parseWatch, waitMinutes, waitedText, waitingMessage, type OrderWatch,
} from '@/lib/order-watch'

const NOW = new Date('2026-10-23T12:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
const watch = (over: Partial<OrderWatch> = {}): OrderWatch => ({ armed: true, since: NOW.getTime(), tz: 'Asia/Beirut', alerted: [], ...over })

describe('order watch: the marker', () => {
  it('reads what was written and nothing else', () => {
    assert.deepEqual(parseWatch(JSON.stringify(watch({ alerted: ['a1'] }))), watch({ alerted: ['a1'] }))
    for (const junk of [null, '', 'nope', '[]', '{}', '{"since":"x"}', '{"since":-5}', 7]) assert.equal(parseWatch(junk as any), null, String(junk))
  })
  it('drops odd ids and keeps the timezone default', () => {
    const w = parseWatch({ armed: true, since: 5, alerted: ['ok1', '../x', 5, 'a b', 'fine_2'] })
    assert.deepEqual(w?.alerted, ['ok1', 'fine_2'])
    assert.equal(w?.tz, 'UTC')
    assert.equal(parseWatch({ armed: 'yes', since: 5 })?.armed, false)
  })
})

describe('order watch: minutes the owner chose', () => {
  it('empty is the default, 0 is off, others are kept within limits', () => {
    assert.equal(waitMinutes(undefined), DEFAULT_WAIT_MINUTES)
    assert.equal(waitMinutes(''), DEFAULT_WAIT_MINUTES)
    assert.equal(waitMinutes('abc'), DEFAULT_WAIT_MINUTES)
    assert.equal(waitMinutes('0'), 0)
    assert.equal(waitMinutes('-3'), 0)
    assert.equal(waitMinutes('5'), MIN_WAIT_MINUTES)
    assert.equal(waitMinutes('45'), 45)
    assert.equal(waitMinutes('99999'), MAX_WAIT_MINUTES)
  })
})

describe('order watch: night time', () => {
  // Dubai is UTC+4 all year, so these hours never move with summer time.
  const dubai = (hhmm: string) => inQuietHours(new Date(`2026-10-23T${hhmm}:00Z`), 'Asia/Dubai')
  it('is quiet from 11 pm to 8 am store time', () => {
    assert.equal(dubai('19:00'), true)  // 23:00
    assert.equal(dubai('22:30'), true)  // 02:30
    assert.equal(dubai('03:59'), true)  // 07:59
    assert.equal(dubai('04:00'), false) // 08:00
    assert.equal(dubai('12:00'), false) // 16:00
    assert.equal(dubai('18:59'), false) // 22:59
  })
  it('falls back to UTC for an unknown timezone instead of failing', () => {
    assert.equal(inQuietHours(new Date('2026-10-23T12:00:00Z'), 'Not/AZone'), false)
    assert.equal(inQuietHours(new Date('2026-10-23T02:00:00Z'), 'Not/AZone'), true)
  })
})

describe('order watch: which orders are due', () => {
  const orders = [{ id: 'a', orderNumber: '1001', createdAt: ago(90) }, { id: 'b', orderNumber: '1002', createdAt: ago(30) }, { id: 'c', orderNumber: '1003', createdAt: ago(61) }]
  it('picks orders that waited the full time and were not told about yet', () => {
    assert.deepEqual(dueOrders(orders, NOW, 60, []).map(o => o.id), ['a', 'c'])
    assert.deepEqual(dueOrders(orders, NOW, 60, ['a']).map(o => o.id), ['c'])
    assert.deepEqual(dueOrders(orders, NOW, 30, []).map(o => o.id), ['a', 'b', 'c'])
  })
  it('does nothing when the owner switched it off', () => assert.deepEqual(dueOrders(orders, NOW, 0, []), []))
  it('counts exactly at the limit as due', () => assert.equal(dueOrders([{ id: 'x', createdAt: ago(60) }], NOW, 60, []).length, 1))
})

describe('order watch: what the marker says next', () => {
  const pending = [{ id: 'a', createdAt: ago(90) }, { id: 'b', createdAt: ago(10) }]
  it('stays armed while a waiting order has not reached its time', () => {
    const next = nextWatch(watch(), pending, ['a'], 60, NOW)
    assert.equal(next.armed, true)
    assert.deepEqual(next.alerted, ['a'])
  })
  it('stops being armed once everyone waiting has been told about', () => {
    const next = nextWatch(watch({ alerted: ['b'] }), pending, ['a'], 60, NOW)
    assert.equal(next.armed, false)
    assert.deepEqual(next.alerted.sort(), ['a', 'b'])
  })
  it('forgets orders that are no longer waiting, so the list never grows', () => {
    const next = nextWatch(watch({ alerted: ['gone', 'a'] }), [{ id: 'a', createdAt: ago(90) }], [], 60, NOW)
    assert.deepEqual(next.alerted, ['a'])
    assert.equal(next.armed, false)
  })
  it('stops when nothing is waiting or the owner switched it off', () => {
    assert.equal(nextWatch(watch(), [], [], 60, NOW).armed, false)
    assert.equal(nextWatch(watch(), pending, [], 0, NOW).armed, false)
  })
  it('keeps the timezone and start time', () => {
    const next = nextWatch(watch({ tz: 'Asia/Dubai', since: 5 }), pending, [], 60, NOW)
    assert.equal(next.tz, 'Asia/Dubai')
    assert.equal(next.since, 5)
  })
})

describe('order watch: messages', () => {
  it('writes the waiting time in plain words', () => {
    assert.equal(waitedText(5), '5 min')
    assert.equal(waitedText(60), '1 h')
    assert.equal(waitedText(70), '1 h 10 min')
  })
  it('names one waiting order', () => {
    const m = waitingMessage([{ id: 'a', orderNumber: '1001', createdAt: ago(75) }], NOW)
    assert.equal(m.title, 'An order is waiting for you')
    assert.match(m.body, /#1001 has waited 1 h 15 min/)
  })
  it('summarises several, oldest first, and caps the list', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, orderNumber: String(1000 + i), createdAt: ago(60 + i * 10) }))
    const m = waitingMessage(many, NOW)
    assert.equal(m.title, '6 orders are waiting for you')
    assert.match(m.body, /^#1005, #1004, #1003, #1002 and 2 more/)
    assert.match(m.body, /oldest waited 1 h 50 min/)
  })
})

describe('order watch: checkout failure alert', () => {
  it('tells database trouble, payment trouble and anything else apart', () => {
    assert.equal(checkoutFailureKind(Object.assign(new Error('x'), { code: 'P1001' })), 'database')
    assert.equal(checkoutFailureKind(Object.assign(new Error('x'), { code: 'P2024' })), 'database')
    assert.equal(checkoutFailureKind(new Error('connect ECONNREFUSED 127.0.0.1:5432')), 'database')
    assert.equal(checkoutFailureKind(new Error('Payment gateway timeout')), 'payment')
    assert.equal(checkoutFailureKind(new Error('boom')), 'other')
    assert.equal(checkoutFailureKind(undefined), 'other')
  })
  it('never repeats the raw error or anything personal in the text', () => {
    const secret = 'jane@example.com +96170123456'
    const text = checkoutAlertText(checkoutFailureKind(new Error(`failed for ${secret}`)))
    assert.ok(!JSON.stringify(text).includes('jane') && !JSON.stringify(text).includes('96170'))
    assert.match(text.body, /try an order yourself/)
  })
})

describe('order watch: wiring', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('runs every 15 minutes next to the daily job', () => {
    assert.equal(ORDER_WATCH_CRON, '*/15 * * * *')
    assert.match(read('wrangler.jsonc'), /"crons": \["37 5 \* \* \*", "\*\/15 \* \* \* \*"\]/)
  })
  it('the Worker reads the marker before it ever calls the app', () => {
    const w = read('worker.ts')
    const marker = w.indexOf('MEDIA_BUCKET?.get(ORDER_WATCH_KEY)')
    const call = w.indexOf('worker.fetch(request, env, ctx)', marker)
    assert.ok(marker > 0 && call > marker)
    assert.match(w, /watch\?\.armed && !inQuietHours/)
    assert.match(w, /paths\.push\('\/api\/internal\/reconcile-refunds'\)/)
  })
  it('only the cron can run the check, and it stays out of the public media route', () => {
    assert.match(read('app/api/internal/order-watch/route.ts'), /isInternalJobRequest\(req\)/)
    assert.match(read('app/api/media/[key]/route.ts'), /key\.includes\('\/'\)/)
  })
  it('checkout arms the watch for cash and transfer orders and alerts on unexpected failures', () => {
    const c = read('app/api/checkout/route.ts')
    assert.match(c, /paymentMethod !== PaymentMethod\.CARD\) runInBackground\(armOrderWatch\(\)\)/)
    assert.match(c, /failure\.status >= 500\) runInBackground\(alertCheckoutFailure\(error\)\)/)
  })
  it('the daily job re-arms the watch and the settings can be saved', () => {
    assert.match(read('app/api/internal/daily/route.ts'), /rearmOrderWatch\(\)/)
    assert.match(read('app/admin/settings/page.tsx'), /'notifications\.stuckOrderMinutes'/)
    assert.match(read('app/admin/settings/page.tsx'), /'notifications\.orderProblems'/)
  })
})
