import { json } from '@/lib/utils'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { normalizeEmail, subscribeToNewsletter } from '@/lib/newsletter'

// Public endpoint behind the storefront Newsletter section and the footer form.
export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`newsletter:${clientIp(req.headers)}`, 8, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
    const body = await req.json().catch(() => ({}))
    // Hidden "company" field: real visitors never see or fill it, bots do. Answer exactly
    // as for a real signup so the bot learns nothing, but store nothing.
    if (typeof body?.company === 'string' && body.company.trim()) return json({ ok: true })
    const email = normalizeEmail(body?.email)
    if (!email) return json({ error: 'Please enter a valid email address.' }, { status: 400 })
    await subscribeToNewsletter(email, typeof body?.source === 'string' ? body.source : 'storefront')
    // Identical response whether or not the address was already subscribed, so this
    // endpoint can't be used to check who is on the list.
    return json({ ok: true })
  } catch {
    return json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
