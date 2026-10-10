import { routeError } from '@/lib/api-error'
import { getCurrentUser } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { json } from '@/lib/utils'
import { hasPushSubscription, removePushSubscription, savePushSubscription, sendTestPush } from '@/lib/push'

async function staffUser() {
  const user = await getCurrentUser()
  if (!user || !hasPermission(user, 'orders.view')) return null
  return user
}

// ?endpoint= asks about one device (the browser's own subscription), which is what the admin's
// "Order alerts on" button shows; without it, whether this staff member has alerts anywhere.
export async function GET(req: Request) {
  const user = await staffUser()
  if (!user) return json({ error: 'Forbidden' }, { status: 403 })
  const endpoint = new URL(req.url).searchParams.get('endpoint')?.trim() || undefined
  return json({ subscribed: await hasPushSubscription(user.id, endpoint) })
}

export async function POST(req: Request) {
  try {
    const user = await staffUser()
    if (!user) return json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    if (body?.test === true) return json(await sendTestPush(user.id, typeof body.endpoint === 'string' && body.endpoint.trim() ? body.endpoint.trim() : undefined))
    await savePushSubscription(user.id, body)
    const subscribed = await hasPushSubscription(user.id, String(body?.endpoint || '').trim())
    if (!subscribed) return json({ error: 'Push subscription was not saved' }, { status: 500 })
    return json({ ok: true, subscribed: true })
  } catch (e) {
    return routeError(e, 'Unable to save push subscription', 400)
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await staffUser()
    if (!user) return json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const endpoint = String(body.endpoint || '').trim()
    if (!endpoint) return json({ error: 'Endpoint is required' }, { status: 400 })
    await removePushSubscription(user.id, endpoint)
    return json({ ok: true })
  } catch (e) {
    return routeError(e, 'Unable to remove push subscription', 400)
  }
}
