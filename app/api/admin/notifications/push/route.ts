import { getCurrentUser } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { json } from '@/lib/utils'
import { hasPushSubscription, removePushSubscription, savePushSubscription, sendTestPush } from '@/lib/push'

async function staffUser() {
  const user = await getCurrentUser()
  if (!user || !hasPermission(user.role, 'orders.view')) return null
  return user
}

export async function GET() {
  const user = await staffUser()
  if (!user) return json({ error: 'Forbidden' }, { status: 403 })
  return json({ subscribed: await hasPushSubscription(user.id) })
}

export async function POST(req: Request) {
  try {
    const user = await staffUser()
    if (!user) return json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    if (body?.test === true) return json(await sendTestPush(user.id))
    await savePushSubscription(user.id, body)
    const subscribed = await hasPushSubscription(user.id, String(body?.endpoint || '').trim())
    if (!subscribed) return json({ error: 'Push subscription was not saved' }, { status: 500 })
    return json({ ok: true, subscribed: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to save push subscription' }, { status: 400 })
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
    return json({ error: e instanceof Error ? e.message : 'Unable to remove push subscription' }, { status: 400 })
  }
}
