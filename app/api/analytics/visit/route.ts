import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { clientIp } from '@/lib/request-ip'
import { consumeRateLimit } from '@/lib/rate-limit'
import { readVisit } from '@/lib/visit-input'
import { recordVisit } from '@/lib/visitors'
import { RETURNING_COOKIE, RETURNING_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_SECONDS, isStaffUser, isTrackedPath } from '@/lib/visitor-tracking'

// Every store page view and heartbeat lands here (components/visitor-tracker.tsx). Nothing about the
// visitor's address is kept: it is only used below to slow down a script that floods this endpoint.

const SID = /^[a-f0-9]{32}$/

function cookieOf(req: Request, name: string) {
  const raw = req.headers.get('cookie') || ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1] || null
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export async function POST(req: Request) {
  try {
    // Normal browsing is a few reports a minute; this keeps a script from turning it into unlimited writes.
    const limit = consumeRateLimit(`visit:ip:${clientIp(req.headers)}`, 90, 60 * 1000)
    if (!limit.allowed) return json({ ok: true, throttled: true }, { status: 202 })
    const input = readVisit(await req.json().catch(() => ({})))
    // The admin and the editor's preview are not store visits (the tracker does not send them; this
    // keeps an old open tab from counting them either).
    if (input.kind !== 'leave' && !isTrackedPath(input.path)) return json({ ok: true, tracked: false })

    // The owner and staff looking at their own store are not visitors: nothing is recorded and the
    // page stops reporting ("staff").
    const user = await getCurrentUser()
    if (isStaffUser(user)) return json({ ok: true, tracked: false, staff: true })

    const stored = cookieOf(req, SESSION_COOKIE)
    const result = await recordVisit(input, {
      sid: stored && SID.test(stored) ? stored : null,
      cameBefore: cookieOf(req, RETURNING_COOKIE) === '1',
      headers: req.headers,
      ownHost: new URL(req.url).host,
      userId: user?.role === 'CUSTOMER' ? user.id : null,
    })
    const response = json({ ok: true, tracked: !!result })
    if (result && input.kind !== 'leave') {
      response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, result.sid, SESSION_TTL_SECONDS))
      if (result.created) response.headers.append('Set-Cookie', cookie(RETURNING_COOKIE, '1', RETURNING_TTL_SECONDS))
    }
    return response
  } catch (error) {
    console.error('[analytics/visit] failure', error)
    return json({ error: 'Unable to record the visit' }, { status: 500 })
  }
}
