import { getCurrentUser } from '@/lib/auth'
import { requestBackInStock } from '@/lib/back-in-stock'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'

// Public endpoint behind "Notify me when it's back" on sold-out products
// (components/back-in-stock-button.tsx). No account needed; a handful of tries per visitor per
// 10 minutes. Answers { inStock: true } when it can already be bought (the page was out of date).
export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`back-in-stock:${clientIp(req.headers)}`, 10, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'Something went wrong. Please try again.' }, { status: 400 })
    const user = await getCurrentUser().catch(() => null)
    const result = await requestBackInStock(body, user?.role === 'CUSTOMER' ? user.id : null)
    return json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/^Invalid push/.test(message)) return json({ error: 'Notifications could not be turned on in this browser.' }, { status: 400 })
    if (/^(Choose a product|This product|This option|Please enter)/.test(message)) return json({ error: message }, { status: 400 })
    console.error('[back-in-stock] request failed', error)
    return json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
