import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { hasCustomerPushSubscription, removeCustomerPushSubscription, saveCustomerPushSubscription } from '@/lib/push'

async function customer() {
  const user = await getCurrentUser()
  return user?.role === 'CUSTOMER' ? user : null
}

export async function GET() {
  const user = await customer()
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 })
  return json({ subscribed: await hasCustomerPushSubscription(user.id) })
}

export async function POST(req: Request) {
  try {
    const user = await customer()
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    await saveCustomerPushSubscription(user.id, body)
    const endpoint = String(body?.endpoint || '').trim()
    const subscribed = await hasCustomerPushSubscription(user.id, endpoint)
    if (!subscribed) return json({ error: 'Push subscription was not saved' }, { status: 500 })
    return json({ ok: true, subscribed: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to save push subscription' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await customer()
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const endpoint = String(body?.endpoint || '').trim()
    if (!endpoint) return json({ error: 'Endpoint is required' }, { status: 400 })
    await removeCustomerPushSubscription(endpoint)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to disable notifications' }, { status: 400 })
  }
}
