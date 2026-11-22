import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { POST } from '@/app/api/internal/server-errors/route'
import { SERVER_ERROR_ALERT_EVERY_MS, SERVER_ERROR_THRESHOLD, SERVER_ERROR_WINDOW_MS, countsAsServerError, noteServerError, parseServerErrors, serverErrorSummary, type ServerErrorState } from '@/lib/server-errors'

// Server errors the store answers with reach the owner (docs/server-error-alerts-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const T0 = Date.UTC(2026, 10, 22, 10, 0, 0)
const run = (state: ServerErrorState | null, times: number[], path = '/shop', status = 500) => {
  let alerts = 0
  for (const t of times) { const next = noteServerError(state, t, path, status); state = next.state; if (next.alert) alerts++ }
  return { state: state!, alerts }
}

describe('which answers count as server errors', () => {
  it('500 and up from pages and APIs; not 503 (maintenance answers it on purpose), not the store\'s own jobs, not a failing outside image', () => {
    assert.equal(countsAsServerError(500, '/shop', false), true)
    assert.equal(countsAsServerError(502, '/api/checkout', false), true)
    assert.equal(countsAsServerError(503, '/', false), false)
    assert.equal(countsAsServerError(404, '/nope', false), false)
    assert.equal(countsAsServerError(500, '/api/internal/daily', false), false)
    assert.equal(countsAsServerError(500, '/shop', true), false)
    // An outside image host failing is not the store failing; the proxy's own bug still is.
    assert.equal(countsAsServerError(502, '/api/image-proxy', false), false)
    assert.equal(countsAsServerError(504, '/api/image-proxy', false), false)
    assert.equal(countsAsServerError(500, '/api/image-proxy', false), true)
  })
})

describe('the owner is told once enough errors come close together', () => {
  it(`${SERVER_ERROR_THRESHOLD} errors within ${SERVER_ERROR_WINDOW_MS / 60000} minutes make one alert; fewer, or spread out, none`, () => {
    const close = run(null, [0, 1, 2, 3, 4, 5, 6].map(m => T0 + m * 60_000))
    assert.equal(close.alerts, 1)
    assert.equal(close.state.count, 7)
    assert.equal(close.state.triedAt, T0 + 4 * 60_000, 'the fifth error is the one that asks')
    const spread = run(null, [0, 11, 22, 33, 44, 55].map(m => T0 + m * 60_000))
    assert.equal(spread.alerts, 0, 'one error every 11 minutes never fills a window')
    assert.equal(spread.state.count, 1)
  })
  it('after the owner was told, not again for 6 hours; a try that failed is tried again in the next window', () => {
    const told = run(null, [0, 1, 2, 3, 4].map(m => T0 + m * 60_000))
    const afterAlert = { ...told.state, alertedAt: T0 + 4 * 60_000 }
    assert.equal(run(afterAlert, [20, 21, 22, 23, 24].map(m => T0 + m * 60_000)).alerts, 0, 'within 6 hours')
    assert.equal(run(afterAlert, [0, 1, 2, 3, 4].map(m => T0 + SERVER_ERROR_ALERT_EVERY_MS + m * 60_000)).alerts, 1, 'after 6 hours')
    // The store could not be told (the database is down): no new try in the same window, one in the next.
    assert.equal(run(told.state, [5, 6, 7].map(m => T0 + m * 60_000)).alerts, 0)
    assert.equal(run(told.state, [15, 16, 17, 18, 19].map(m => T0 + m * 60_000)).alerts, 1)
  })
  it('keeps the 10 pages with the most errors, and says what failed where', () => {
    let state: ServerErrorState | null = null
    for (let i = 0; i < 14; i++) state = noteServerError(state, T0 + i * 1000, `/product/p${i}`, 500).state
    state = noteServerError(state, T0 + 20_000, '/shop', 502).state
    state = noteServerError(state, T0 + 21_000, '/shop', 500).state
    assert.equal(Object.keys(state!.paths).length, 10)
    assert.equal(state!.paths['/shop'], 2)
    assert.match(serverErrorSummary(state!), /^16 requests failed with a server error in 10 minutes: \/shop \(2\), .+\. Errors: 500 ×15, 502 ×1\.$/)
  })
  it('reads only a well-formed record back', () => {
    assert.equal(parseServerErrors('not json'), null)
    assert.equal(parseServerErrors('{"count":"x"}'), null)
    const back = parseServerErrors(JSON.stringify({ windowStart: T0, count: 3, paths: { '/a': 3, '/b': 'x' }, statuses: { 500: 3 }, alertedAt: null, triedAt: 'no' }))
    assert.deepEqual(back, { windowStart: T0, count: 3, paths: { '/a': 3 }, statuses: { 500: 3 }, alertedAt: null, triedAt: null })
  })
})

describe('the Worker counts them and the store tells the owner', () => {
  it('counts every answer after the store made it, and thrown errors as 500', () => {
    const worker = read('worker.ts')
    assert.match(worker, /noteStatus\(500\)\n\s+ctx\.waitUntil\(finish\(\)\)\n\s+throw error/)
    assert.match(worker, /noteStatus\(response\.status\)/)
    assert.match(worker, /countsAsServerError\(status, url\.pathname, request\.headers\.has\('x-internal-job'\)\)\) ctx\.waitUntil\(recordServerError/)
    assert.match(worker, /if \(response\.ok\) await bucket\.put\(SERVER_ERRORS_KEY, JSON\.stringify\(\{ \.\.\.state, alertedAt: now \}\)\)/)
  })
  it('the alert route takes only the Worker\'s key or the bearer, and a real record', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    const send = (body: unknown, auth?: string) => POST(new Request('http://x/api/internal/server-errors', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }))
    assert.equal((await send({ state: { windowStart: T0, count: 5 } })).status, 401)
    assert.equal((await send({ state: { windowStart: T0, count: 5 } }, 'Bearer wrong')).status, 401)
    assert.equal((await send({ state: null }, 'Bearer test-cron-secret')).status, 400)
    assert.equal((await send({ state: { windowStart: T0, count: 0 } }, 'Bearer test-cron-secret')).status, 400)
    const alerts = read('lib/order-alerts.ts')
    assert.match(alerts, /await audit\(null, 'store\.server_errors', 'Store', 'server-errors', \{ count, summary \}\)/)
    assert.match(alerts, /if \(!\(await orderProblemAlertsOn\(\)\)\) return false\n\s+const gate = await consumeDurableRateLimit\('alert:server-errors', 1, SERVER_ERRORS_ALERT_WINDOW_MS\)/)
  })
})
