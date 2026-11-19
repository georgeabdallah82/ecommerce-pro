import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { OUTBOX_MAX_ATTEMPTS, nextAttemptDelayMs } from '@/lib/outbox'
import { emailFailureIsPermanent, sendEmail } from '@/lib/email'
import { retryQueuedWebhook } from '@/lib/webhooks'
import { POST } from '@/app/api/internal/retry-outbox/route'

// Retries for failed emails and webhook deliveries (docs/retry-emails-webhooks-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const HOUR = 3600_000

describe('the retry schedule', () => {
  it('tries again 1, 2, 4, 8 and 8 hours later: six tries over about a day', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(n => nextAttemptDelayMs(n) / HOUR), [1, 2, 4, 8, 8])
    assert.equal(OUTBOX_MAX_ATTEMPTS, 6)
  })
})

describe('emails', () => {
  it('a failure that may pass is kept for another try; a refusal is not', () => {
    for (const status of [429, 500, 502, 503]) assert.equal(emailFailureIsPermanent(status), false, String(status))
    for (const status of [400, 401, 403, 404, 422]) assert.equal(emailFailureIsPermanent(status), true, String(status))
    assert.match(read('lib/email.ts'), /if \(!result\.ok && !result\.permanent && extra\?\.retry !== false\) await queueRetry\('email', message, /)
  })
  it('every try of an email carries the idempotency key of its first', () => {
    const email = read('lib/email.ts')
    assert.match(email, /idempotencyKey: crypto\.randomUUID\(\)/)
    assert.match(email, /'idempotency-key': message\.idempotencyKey/)
  })
  it('a password reset is never retried: its link expires within the hour', () => {
    assert.match(read('lib/email.ts'), /return sendEmail\(to, 'Reset your password', html, text, \{ retry: false \}\)/)
  })
  it('sends with a key, and reports a refusal without throwing', async () => {
    const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, fetch: global.fetch }
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'orders@example.com'
    const keys: string[] = []
    global.fetch = (async (_url: string, init?: RequestInit) => {
      keys.push((init?.headers as Record<string, string>)['idempotency-key'])
      return new Response(JSON.stringify({ message: 'invalid' }), { status: 422 })
    }) as typeof fetch
    try {
      const result = await sendEmail('customer@example.com', 'Hello', '<p>hi</p>', 'hi')
      assert.equal(result.sent, false)
      assert.match(keys[0], /^[0-9a-f-]{36}$/)
    } finally {
      global.fetch = saved.fetch
      if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key
      if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from
    }
  })
})

describe('webhooks', () => {
  it('each event has an id; a delivery still failing after the quick retries is kept for the hourly job', () => {
    const webhooks = read('lib/webhooks.ts')
    assert.match(webhooks, /JSON\.stringify\(\{ id: randomUUID\(\), topic, payload, sentAt/)
    assert.match(webhooks, /if \(options\.queue !== false\) await queueRetry\('webhook', \{ endpointId: endpoint\.id, body \}/)
    assert.match(webhooks, /await deliver\(endpoint, endpoint\.lastPayload, \{ queue: false \}\)/)
  })
  it('a queued delivery to an endpoint that is gone is given up', async () => {
    const result = await retryQueuedWebhook({ endpointId: 'no-such-endpoint', body: '{}' })
    assert.equal(result.ok, false)
    assert.equal(result.permanent, true)
  })
})

describe('the hourly job', () => {
  it('runs at the top of each hour from the Worker, with its key or the bearer only', async () => {
    assert.match(read('worker.ts'), /if \(reconcileDue\(controller\.scheduledTime\)\) paths\.push\('\/api\/internal\/retry-outbox'\)/)
    process.env.CRON_SECRET = 'test-cron-secret'
    assert.equal((await POST(new Request('http://x/api/internal/retry-outbox', { method: 'POST' }))).status, 401)
    const ran = await POST(new Request('http://x/api/internal/retry-outbox', { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } }))
    assert.equal(ran.status, 200)
    assert.deepEqual(Object.keys(await ran.json()), ['checked', 'sent', 'waiting', 'gaveUp', 'cleaned'])
  })
})
