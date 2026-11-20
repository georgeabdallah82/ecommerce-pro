import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { db } from '@/lib/prisma'
import { MetaApiError, metaFailureIsPermanent, retryQueuedMeta, sendMetaEvents } from '@/lib/meta-capi'

// Retries for sales reported to Meta (docs/meta-retries-2026-11.md). Sending the sale, keeping it and trying it again
// were also run on the production build against Postgres and a stand-in for Meta.
const read = (path: string) => readFileSync(path, 'utf8')
const PIXEL = '123456789012345'

async function withFetch<T>(answer: (url: string, init: RequestInit) => Response | Promise<Response>, run: (calls: Array<{ url: string; body: any }>) => Promise<T>) {
  const saved = global.fetch
  const calls: Array<{ url: string; body: any }> = []
  global.fetch = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init.body)) }); return answer(String(url), init) }) as typeof fetch
  try { return await run(calls) } finally { global.fetch = saved }
}
const answer = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status })

describe('which failures are tried again', () => {
  it('no answer, too many requests, Meta\'s own error, an answer Meta marks as passing, an expired key', () => {
    assert.equal(metaFailureIsPermanent(new TypeError('fetch failed')), false)
    assert.equal(metaFailureIsPermanent(new DOMException('The operation timed out.', 'TimeoutError')), false)
    for (const [status, code, transient] of [[503, 0, false], [500, 2, false], [400, 1, false], [429, 0, false], [400, 4, false], [400, 17, false], [400, 32, false], [400, 341, false], [400, 613, false], [400, 100, true], [400, 190, false], [401, 190, false]] as const) {
      assert.equal(metaFailureIsPermanent(new MetaApiError('x', status, code, transient)), false, `${status}/${code}/${transient}`)
    }
  })
  it('a malformed event or a wrong Pixel ID would be refused again: not kept', () => {
    for (const [status, code] of [[400, 100], [400, 803], [403, 10], [404, 0], [400, 0]] as const) {
      assert.equal(metaFailureIsPermanent(new MetaApiError('x', status, code, false)), true, `${status}/${code}`)
    }
  })
  it('the refusal keeps Meta\'s status, code and is_transient', async () => {
    await withFetch(answer(400, { error: { message: 'Error validating access token', type: 'OAuthException', code: 190, is_transient: false } }), async () => {
      const error = await sendMetaEvents([{ event_name: 'Purchase' }], { pixelId: PIXEL, token: 'k' }).catch(e => e)
      assert.ok(error instanceof MetaApiError)
      assert.deepEqual([error.message, error.status, error.code, error.transient], ['Error validating access token', 400, 190, false])
    })
  })
})

describe('the hourly try', () => {
  it('sends the same events with the key saved in Settings now, and the test code of the first try', async () => {
    await db.setting.upsert({ where: { key: 'tracking.metaPixelId' }, update: { value: PIXEL }, create: { key: 'tracking.metaPixelId', value: PIXEL } })
    await db.setting.upsert({ where: { key: 'tracking.metaCapiToken' }, update: { value: 'saved-key' }, create: { key: 'tracking.metaCapiToken', value: 'saved-key' } })
    const event = { event_name: 'Purchase', event_id: 'purchase-1001', event_time: 1763600000 }
    await withFetch(answer(200, { events_received: 1 }), async calls => {
      assert.deepEqual(await retryQueuedMeta({ orderNumber: '1001', events: [event], testCode: 'TEST123' }), { ok: true })
      assert.equal(calls[0].url, `https://graph.facebook.com/v23.0/${PIXEL}/events?access_token=saved-key`)
      assert.deepEqual(calls[0].body, { data: [event], test_event_code: 'TEST123' })
    })
  })
  it('a failure that may pass waits for the next try; a refusal gives up', async () => {
    const message = { orderNumber: '1001', events: [{ event_name: 'Purchase', event_id: 'purchase-1001' }] }
    await withFetch(answer(503, { error: { message: 'Service temporarily unavailable', code: 2, is_transient: true } }), async () => {
      assert.deepEqual(await retryQueuedMeta(message), { ok: false, error: 'Service temporarily unavailable', permanent: false })
    })
    await withFetch(answer(400, { error: { message: 'Invalid parameter', code: 100 } }), async () => {
      assert.deepEqual(await retryQueuedMeta(message), { ok: false, error: 'Invalid parameter', permanent: true })
    })
    assert.deepEqual(await retryQueuedMeta({ orderNumber: '1001', events: [] }), { ok: false, error: 'Nothing to send', permanent: true })
  })
})

describe('the sale report', () => {
  it('keeps a failure that may pass, as built (same event id and time), without the access key', () => {
    const capi = read('lib/meta-capi.ts')
    assert.match(capi, /queued = \{ orderNumber: order\.orderNumber, events: \[buildMetaPurchaseEvent\(order, \{[^}]*\}\)\], testCode: config\.testCode \}/)
    assert.match(capi, /if \(queued && !metaFailureIsPermanent\(error\)\) await queueRetry\('meta', queued, message\)/)
    assert.doesNotMatch(capi.slice(capi.indexOf('queued = {'), capi.indexOf('queued = {') + 300), /token/)
  })
  it('the hourly job tries it again', () => {
    const outbox = read('lib/outbox.ts')
    assert.match(outbox, /export type OutboxKind = 'email' \| 'webhook' \| 'whatsapp' \| 'meta'/)
    assert.match(outbox, /if \(kind === 'meta'\) return \(await import\('@\/lib\/meta-capi'\)\)\.retryQueuedMeta\(payload\)/)
  })
})
