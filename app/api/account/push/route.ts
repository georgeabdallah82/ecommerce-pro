import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { hasCustomerPushSubscription, removeCustomerPushSubscription, saveCustomerPushSubscription } from '@/lib/push'
import { routeError } from '@/lib/api-error'

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
    // Linked to the account only for customers; a staff member testing from the storefront is
    // saved like a guest, so campaigns still reach that device.
    await saveCustomerPushSubscription(user.role === 'CUSTOMER' ? user.id : null, body)
    return json({ ok: true, subscribed: true })
  } catch (error) {
    return routeError(error, 'Unable to save push subscription', 400)
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser()
    // A body of null (valid JSON) is read like an empty one, not as a crash (docs/input-hardening-2026-11.md).
    const body = (await req.json().catch(() => null)) ?? {}
    const endpoint = String(body.endpoint || '').trim()
    if (!endpoint) return json({ error: 'Endpoint is required' }, { status: 400 })
    await removeCustomerPushSubscription(user.id, endpoint)
    return json({ ok: true })
  } catch (error) {
    return routeError(error, 'Unable to remove push subscription', 400)
  }
}
