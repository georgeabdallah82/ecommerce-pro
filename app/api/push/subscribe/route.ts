import { getCurrentUser } from '@/lib/auth'
import { saveCustomerPushSubscription } from '@/lib/push'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'

// Public endpoint behind the storefront's notification popup (components/push-opt-in.tsx):
// saves the browser's push subscription so Push campaigns reach it. No account needed; a
// signed-in customer's device is linked to their account. Only real push-service addresses
// are accepted (lib/push-opt-in.ts), and each visitor gets a handful of tries per 10 minutes.
export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`push-subscribe:${clientIp(req.headers)}`, 10, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
    const body = await req.json().catch(() => null)
    const user = await getCurrentUser().catch(() => null)
    await saveCustomerPushSubscription(user?.role === 'CUSTOMER' ? user.id : null, body)
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/^Invalid push/.test(message)) return json({ error: 'That is not a valid notification subscription.' }, { status: 400 })
    console.error('[push] subscribe failed', error)
    return json({ error: 'Could not turn on notifications. Please try again.' }, { status: 500 })
  }
}
