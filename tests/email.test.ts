import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { sendEmail } from '@/lib/email'

const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM'] as const
let savedEnv: Record<string, string | undefined>
let savedFetch: typeof fetch

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  savedFetch = global.fetch
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  global.fetch = savedFetch
})

describe('lib/email sendEmail', () => {
  it('no-ops without throwing when RESEND_API_KEY/EMAIL_FROM are unset', async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    let fetchCalled = false
    global.fetch = (async () => { fetchCalled = true; throw new Error('should not be called') }) as typeof fetch

    const result = await sendEmail('customer@example.com', 'Subject', '<p>hi</p>', 'hi')
    assert.equal(result.sent, false)
    assert.equal(result.skipped, true)
    assert.equal(fetchCalled, false, 'should not attempt a network call when unconfigured')
  })

  it('posts to the Resend API with the configured sender when credentials are set', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'orders@example.com'
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    global.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return new Response(JSON.stringify({ id: 'abc' }), { status: 200 })
    }) as typeof fetch

    const result = await sendEmail('customer@example.com', 'Order confirmed', '<p>hi</p>', 'hi')
    assert.equal(result.sent, true)
    assert.equal(result.skipped, false)
    assert.equal(capturedUrl, 'https://api.resend.com/emails')
    assert.equal((capturedInit?.headers as Record<string, string>)?.authorization, 'Bearer test-key')
    const body = JSON.parse(String(capturedInit?.body))
    assert.equal(body.from, 'orders@example.com')
    assert.equal(body.to, 'customer@example.com')
    assert.equal(body.subject, 'Order confirmed')
  })

  it('reports failure without throwing when the provider rejects the request', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'orders@example.com'
    global.fetch = (async () => new Response('bad request', { status: 400 })) as typeof fetch

    const result = await sendEmail('customer@example.com', 'Subject', '<p>hi</p>', 'hi')
    assert.equal(result.sent, false)
    assert.equal(result.skipped, false)
  })

  it('reports failure without throwing when the network call itself throws', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'orders@example.com'
    global.fetch = (async () => { throw new Error('network down') }) as typeof fetch

    const result = await sendEmail('customer@example.com', 'Subject', '<p>hi</p>', 'hi')
    assert.equal(result.sent, false)
    assert.equal(result.skipped, false)
  })
})
