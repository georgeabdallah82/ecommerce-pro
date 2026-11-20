import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { sendOrderProblemEmail } from '@/lib/email'
import { sendOrderProblemPush } from '@/lib/push'
import {
  CHECKOUT_ALERT_WINDOW_MS, ORDER_PROBLEMS_SETTING, checkoutAlertText, checkoutFailureKind, waitingMessage, type WaitingOrder,
} from '@/lib/order-watch'

// Order-day alerts to the owner (rules in lib/order-watch.ts). Nothing here may disturb an order:
// every failure is logged and swallowed.

export async function orderProblemAlertsOn() {
  return (await db.setting.findUnique({ where: { key: ORDER_PROBLEMS_SETTING } }))?.value !== 'false'
}

// Who gets the email: the store's notification address (the one the morning summary uses) and the
// super admins. Duplicates and the demo address from the starter data are left out.
async function recipients() {
  const [admins, settings] = await Promise.all([
    db.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { email: true } }),
    db.setting.findMany({ where: { key: { in: ['notifications.summaryEmail', 'contact.email'] } }, select: { key: true, value: true } }),
  ])
  const map = new Map(settings.map(s => [s.key, s.value.trim()]))
  return [...new Set([map.get('notifications.summaryEmail') || map.get('contact.email') || '', ...admins.map(a => a.email)]
    .map(e => String(e || '').trim().toLowerCase())
    .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !e.endsWith('@example.com')))].slice(0, 6)
}

async function tell(message: { title: string; body: string; subject: string; path: string; button: string }) {
  const to = await recipients()
  await Promise.allSettled([
    sendOrderProblemPush({ title: message.title, body: message.body, url: message.path }),
    ...to.map(address => sendOrderProblemEmail(address, { subject: message.subject, lines: [message.body], path: message.path, button: message.button })),
  ])
}

// A customer's order failed with an unexpected error (app/api/checkout). At most one alert per
// CHECKOUT_ALERT_WINDOW_MS, shared by every server instance.
export async function alertCheckoutFailure(error: unknown) {
  try {
    if (!(await orderProblemAlertsOn())) return false
    const gate = await consumeDurableRateLimit('alert:checkout-failure', 1, CHECKOUT_ALERT_WINDOW_MS)
    if (!gate.allowed) return false
    const text = checkoutAlertText(checkoutFailureKind(error))
    await tell({ ...text, path: '/admin/website-status', button: 'Open website status' })
    return true
  } catch (alertError) {
    console.error('[order-alerts] checkout failure alert failed', alertError)
    return false
  }
}

// Orders that have waited for confirmation too long (app/api/internal/order-watch).
export async function alertWaitingOrders(orders: WaitingOrder[], now = new Date()) {
  if (!orders.length) return false
  try {
    const text = waitingMessage(orders, now)
    await tell({ ...text, subject: text.title, path: orders.length === 1 ? `/admin/orders/${orders[0].id}` : '/admin/orders', button: orders.length === 1 ? 'Open the order' : 'Open orders' })
    return true
  } catch (error) {
    console.error('[order-alerts] waiting order alert failed', error)
    return false
  }
}

// The Worker's scheduled jobs (worker.ts), by the names the owner knows them.
export const SCHEDULED_JOBS: Record<string, string> = {
  '/api/internal/daily': 'The morning summary and daily clean-up',
  '/api/internal/order-watch': 'The check for orders waiting too long',
  '/api/internal/reconcile-refunds': 'The hourly refund check',
  '/api/internal/release-expired-reservations': 'The hourly stock release for abandoned card checkouts',
  '/api/internal/retry-outbox': 'The hourly retry of failed emails and webhooks',
}
export const JOB_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000

// A scheduled job answered with an error (app/api/internal/job-failed), or a scheduled GitHub check failed
// (app/api/internal/github-check-failed, with its own name and words in `about`). Every failure goes in the activity
// log; the owner is told at most once per job every 6 hours, shared by every server instance, and only while
// "Tell me about order problems" is on (Settings > Notifications).
export async function alertJobFailure(path: string, status: number, detail: string, about?: { name: string; body: string }) {
  const name = about?.name || SCHEDULED_JOBS[path] || path
  await audit(null, 'job.failed', 'Job', path, { status, detail }).catch(error => console.error('[order-alerts] job failure not logged', error))
  try {
    if (!(await orderProblemAlertsOn())) return false
    const gate = await consumeDurableRateLimit(`alert:job:${path}`, 1, JOB_ALERT_WINDOW_MS)
    if (!gate.allowed) return false
    const body = about?.body || `${name} failed${status ? ` (it answered ${status})` : ''}. It runs again on its next schedule; if this keeps happening, open Website status.`
    await tell({ title: 'A scheduled job failed', body, subject: `${name} failed`, path: '/admin/website-status', button: 'Open website status' })
    return true
  } catch (error) {
    console.error('[order-alerts] job failure alert failed', error)
    return false
  }
}
