import { createHmac } from 'node:crypto'
import { db } from '@/lib/prisma'

const MAX_DELIVERY_ATTEMPTS = 3
const RETRY_DELAY_MS = 200

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Retries a handful of times with a short backoff before giving up -- covers the
// brief-outage case (a receiver mid-deploy, a transient DNS/network blip) without
// needing a separate queue. lastPayload is only ever populated after every attempt
// has failed, and only ever cleared on a subsequent success, so it always reflects
// "the exact body that still needs to be redelivered" (or nothing, if none does).
async function deliver(endpoint: { id: string; endpointUrl: string; secret: string }, body: string) {
  const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex')
  let lastStatus: number | null = null
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(endpoint.endpointUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-signature': signature },
        body,
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        await db.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { lastStatus: response.status, lastSentAt: new Date(), lastError: null, lastPayload: null },
        }).catch(() => undefined)
        return
      }
      lastStatus = response.status
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastStatus = null
      lastError = (error instanceof Error ? error.message : 'Delivery failed').slice(0, 500)
    }
    if (attempt < MAX_DELIVERY_ATTEMPTS) await delay(RETRY_DELAY_MS * attempt)
  }

  await db.webhookEndpoint.update({
    where: { id: endpoint.id },
    data: { lastStatus, lastSentAt: new Date(), lastError, lastPayload: body },
  }).catch(() => undefined)
}

// Manually re-sends the body captured from an endpoint's last failed delivery
// (admin-triggered, from the Webhooks panel). Throws when there's nothing to
// retry -- the endpoint doesn't exist, or its last delivery already succeeded.
export async function redeliverWebhook(endpointId: string) {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: endpointId } })
  if (!endpoint) throw new Error('Webhook endpoint not found')
  if (!endpoint.lastPayload) throw new Error('This endpoint has no failed delivery to retry')
  await deliver(endpoint, endpoint.lastPayload)
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

/**
 * Dispatches inventory.updated for each inventory item id, re-reading its
 * current state first (callers pass ids collected during a transaction,
 * not the row data itself, since the row may have changed further within
 * that same transaction after the id was noted). Fire-and-forget, like
 * dispatchWebhookEvent itself -- callers don't need to `void`/catch this.
 */
export function dispatchInventoryUpdated(inventoryIds: Iterable<string>) {
  for (const id of inventoryIds) {
    void db.inventoryItem.findUnique({ where: { id } })
      .then(item => item && dispatchWebhookEvent('inventory.updated', { id: item.id, productId: item.productId, variantId: item.variantId, quantity: item.quantity, reserved: item.reserved, locationId: item.locationId }))
      .catch(error => console.error('[webhook] inventory.updated dispatch failed', error))
  }
}
