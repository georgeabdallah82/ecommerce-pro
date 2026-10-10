import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { countCustomerPushSubscriptions } from '@/lib/push'
import { json } from '@/lib/utils'

// Push campaigns page: the "Ask visitors" switch (the storefront popup, components/push-opt-in.tsx)
// and how many devices a campaign reaches. The popup is on unless switched off ('false').
const KEY = 'push.askVisitors'

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
  if (message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
  return json({ error: 'Unable to load notification settings' }, { status: 500 })
}

export async function GET() {
  try {
    await requirePermission('customers.manage')
    const [setting, subscribers] = await Promise.all([db.setting.findUnique({ where: { key: KEY } }), countCustomerPushSubscriptions()])
    const configured = Boolean((process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
    return json({ askVisitors: setting?.value !== 'false', subscribers, configured })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const body = await req.json().catch(() => ({}))
    if (typeof body?.askVisitors !== 'boolean') return json({ error: 'askVisitors must be true or false' }, { status: 400 })
    const value = body.askVisitors ? 'true' : 'false'
    await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
    await audit(actor.id, 'settings.updated', 'Setting', KEY, { [KEY]: value })
    return json({ askVisitors: body.askVisitors })
  } catch (error) {
    return failure(error)
  }
}
