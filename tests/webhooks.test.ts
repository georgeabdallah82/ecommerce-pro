import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { db } from '@/lib/prisma'
import { dispatchWebhookEvent } from '@/lib/webhooks'

let savedFetch: typeof fetch

beforeEach(() => { savedFetch = global.fetch })
afterEach(() => { global.fetch = savedFetch })

async function makeEndpoint(overrides: Partial<{ topic: string; endpointUrl: string; secret: string; status: string }> = {}) {
  return db.webhookEndpoint.create({
    data: {
      topic: overrides.topic ?? 'order.created',
      endpointUrl: overrides.endpointUrl ?? `https://example.com/hook-${randomUUID()}`,
      secret: overrides.secret ?? 'a-test-secret-that-is-long-enough',
      status: (overrides.status as any) ?? 'ACTIVE',
    },
  })
}

describe('lib/webhooks dispatchWebhookEvent', () => {
  it('does nothing when no endpoint subscribes to the topic', async () => {
    let fetchCalled = false
    global.fetch = (async () => { fetchCalled = true; throw new Error('should not be called') }) as typeof fetch
    await dispatchWebhookEvent(`no-subscribers-${randomUUID()}`, { foo: 'bar' })
    assert.equal(fetchCalled, false)
  })

  it('signs the payload with the endpoint secret and posts it', async () => {
    const secret = 'a-test-secret-that-is-long-enough'
    const topic = `order.created.${randomUUID()}`
    const endpoint = await makeEndpoint({ topic, secret })

    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    global.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch

    await dispatchWebhookEvent(topic, { orderId: 'order_1', total: 4900 })

    assert.equal(capturedUrl, endpoint.endpointUrl)
    const body = String(capturedInit?.body)
    const parsed = JSON.parse(body)
    assert.equal(parsed.topic, topic)
    assert.deepEqual(parsed.payload, { orderId: 'order_1', total: 4900 })
    const expectedSignature = createHmac('sha256', secret).update(body).digest('hex')
    assert.equal((capturedInit?.headers as Record<string, string>)?.['x-webhook-signature'], expectedSignature)

    const updated = await db.webhookEndpoint.findUnique({ where: { id: endpoint.id } })
    assert.equal(updated?.lastStatus, 200)
    assert.equal(updated?.lastError, null)
    assert.ok(updated?.lastSentAt)
  })

  it('records a delivery failure without throwing when the endpoint rejects the request', async () => {
    const topic = `order.updated.${randomUUID()}`
    const endpoint = await makeEndpoint({ topic })
    global.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch

    await dispatchWebhookEvent(topic, { orderId: 'order_2' })

    const updated = await db.webhookEndpoint.findUnique({ where: { id: endpoint.id } })
    assert.equal(updated?.lastStatus, 500)
    assert.equal(updated?.lastError, 'HTTP 500')
  })

  it('records a delivery failure without throwing when the network call itself throws', async () => {
    const topic = `order.updated.${randomUUID()}`
    const endpoint = await makeEndpoint({ topic })
    global.fetch = (async () => { throw new Error('fetch failed') }) as typeof fetch

    await dispatchWebhookEvent(topic, { orderId: 'order_3' })

    const updated = await db.webhookEndpoint.findUnique({ where: { id: endpoint.id } })
    assert.equal(updated?.lastStatus, null)
    assert.equal(updated?.lastError, 'fetch failed')
  })

  it('does not deliver to a DISABLED endpoint', async () => {
    const topic = `order.updated.${randomUUID()}`
    await makeEndpoint({ topic, status: 'DISABLED' })
    let fetchCalled = false
    global.fetch = (async () => { fetchCalled = true; throw new Error('should not be called') }) as typeof fetch

    await dispatchWebhookEvent(topic, { orderId: 'order_4' })
    assert.equal(fetchCalled, false)
  })
})
