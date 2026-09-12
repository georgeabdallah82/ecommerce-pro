import { createHmac } from 'node:crypto'
import { db } from '@/lib/prisma'

async function deliver(endpoint: { id: string; endpointUrl: string; secret: string }, body: string) {
  const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex')
  try {
    const response = await fetch(endpoint.endpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': signature },
      body,
      signal: AbortSignal.timeout(10000),
    })
    await db.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { lastStatus: response.status, lastSentAt: new Date(), lastError: response.ok ? null : `HTTP ${response.status}` },
    }).catch(() => undefined)
  } catch (error) {
    await db.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { lastStatus: null, lastSentAt: new Date(), lastError: (error instanceof Error ? error.message : 'Delivery failed').slice(0, 500) },
    }).catch(() => undefined)
  }
}

/**
 * Fires a webhook event to every ACTIVE endpoint subscribed to `topic`.
 * Non-blocking by design: callers should `void` this and log failures
 * themselves rather than let a slow/unreachable third-party endpoint
 * hold up the request that triggered the event.
 */
export async function dispatchWebhookEvent(topic: string, payload: Record<string, unknown>) {
  const endpoints = await db.webhookEndpoint.findMany({ where: { topic, status: 'ACTIVE' } })
  if (!endpoints.length) return
  const body = JSON.stringify({ topic, payload, sentAt: new Date().toISOString() })
  await Promise.all(endpoints.map((endpoint) => deliver(endpoint, body)))
}
