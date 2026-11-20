import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'

// Emails and webhook deliveries that failed for a reason that may pass -- no answer, a timeout, too many requests,
// the other side's server error -- are kept here and tried again by the hourly job (app/api/internal/retry-outbox,
// which worker.ts runs at the top of each hour) for about a day. An email keeps the idempotency key of its first try,
// so Resend sends it once even if an earlier try went through after all; a webhook keeps its event id, so the
// receiver can skip one it already has. A WhatsApp message (lib/whatsapp-cloud.ts) has no such key, so only a
// failure that never reached WhatsApp or that WhatsApp said to retry is kept. A sale reported to Meta (lib/meta-capi.ts)
// keeps its event id, which Meta counts once. The content is kept only while it still has to go out.
export type OutboxKind = 'email' | 'webhook' | 'whatsapp' | 'meta'
export type DeliveryResult = { ok: boolean; error?: string | null; permanent?: boolean }

export const OUTBOX_MAX_ATTEMPTS = 6
const HOUR = 60 * 60 * 1000
const KEEP_DAYS = 14

// After try n (1 is the first, at the time it happened), the next comes 1, 2, 4, 8 and 8 hours later: six tries
// over about a day.
export function nextAttemptDelayMs(attempts: number) {
  return Math.min(2 ** Math.max(0, attempts - 1), 8) * HOUR
}

export async function queueRetry(kind: OutboxKind, payload: unknown, error: string, now = new Date()) {
  try {
    await db.outboxMessage.create({ data: { kind, payloadJson: JSON.stringify(payload), attempts: 1, nextAttemptAt: new Date(now.getTime() + nextAttemptDelayMs(1)), lastError: String(error).slice(0, 500) } })
  } catch (queueError) {
    console.error('[outbox] could not keep a failed', kind, 'for another try', queueError)
  }
}

// Imported when needed: lib/email.ts, lib/webhooks.ts, lib/whatsapp-cloud.ts and lib/meta-capi.ts import this module
// to queue their failures. `lastTry` lets a WhatsApp message note on its order that it was not sent.
async function attempt(kind: string, payload: any, lastTry: boolean): Promise<DeliveryResult> {
  if (kind === 'email') return (await import('@/lib/email')).retryQueuedEmail(payload)
  if (kind === 'webhook') return (await import('@/lib/webhooks')).retryQueuedWebhook(payload)
  if (kind === 'whatsapp') return (await import('@/lib/whatsapp-cloud')).retryQueuedWhatsApp(payload, lastTry)
  if (kind === 'meta') return (await import('@/lib/meta-capi')).retryQueuedMeta(payload)
  return { ok: false, error: `Unknown kind: ${kind}`, permanent: true }
}

// The hourly job: each message whose next try is due, oldest first, at most `limit` a run.
export async function retryOutbox(now = new Date(), limit = 25) {
  const due = await db.outboxMessage.findMany({ where: { status: 'pending', nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: 'asc' }, take: limit })
  const result = { checked: due.length, sent: 0, waiting: 0, gaveUp: 0, cleaned: 0 }
  for (const message of due) {
    const attempts = message.attempts + 1
    let outcome: DeliveryResult
    try {
      outcome = await attempt(message.kind, JSON.parse(message.payloadJson), attempts >= OUTBOX_MAX_ATTEMPTS)
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    if (outcome.ok) {
      await db.outboxMessage.update({ where: { id: message.id }, data: { status: 'sent', attempts, lastError: null, payloadJson: '{}' } })
      result.sent += 1
      continue
    }
    const giveUp = Boolean(outcome.permanent) || attempts >= OUTBOX_MAX_ATTEMPTS
    await db.outboxMessage.update({
      where: { id: message.id },
      data: giveUp
        ? { status: 'failed', attempts, lastError: String(outcome.error || 'Failed').slice(0, 500), payloadJson: '{}' }
        : { attempts, lastError: String(outcome.error || 'Failed').slice(0, 500), nextAttemptAt: new Date(now.getTime() + nextAttemptDelayMs(attempts)) },
    })
    if (giveUp) {
      result.gaveUp += 1
      await audit(null, 'outbox.gave_up', 'OutboxMessage', message.id, { kind: message.kind, attempts, error: outcome.error })
    } else {
      result.waiting += 1
    }
  }
  // Finished messages (their content already removed) are kept two weeks, then deleted.
  const cleaned = await db.outboxMessage.deleteMany({ where: { status: { in: ['sent', 'failed'] }, updatedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * HOUR) } } })
  result.cleaned = Number(cleaned?.count || 0)
  return result
}
