import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { hasCustomerPushSubscription, removeCustomerPushSubscription, saveCustomerPushSubscription } from '@/lib/push'

export async function GET() {
  try {
    const user = await requireUser()
    return json({ subscribed: await hasCustomerPushSubscription(user.id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to load push status' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json()
    await saveCustomerPushSubscription(user.id, body)
    const subscribed = await hasCustomerPushSubscription(user.id, String(body?.endpoint || '').trim())
    if (!subscribed) return json({ error: 'Push subscription was not saved' }, { status: 500 })
    return json({ ok: true, subscribed: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save push subscription'
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => ({}))
    const endpoint = String(body.endpoint || '').trim()
    if (!endpoint) return json({ error: 'Endpoint is required' }, { status: 400 })
    await removeCustomerPushSubscription(user.id, endpoint)
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove push subscription'
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
