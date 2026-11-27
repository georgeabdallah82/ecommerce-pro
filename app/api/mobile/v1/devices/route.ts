import { requireStaff } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { cleanInstallId } from '@/lib/mobile-auth'
import { DEFAULT_PREFS, getDevice, pushToStaffApps, removeDevice, saveDevice } from '@/lib/mobile-devices'
import { fcmConfigured } from '@/lib/fcm'

const noStore = { 'Cache-Control': 'private, no-store' }

function installIdFrom(req: Request, body?: { installId?: unknown }) {
  return cleanInstallId(body?.installId ?? req.headers.get('x-install-id'))
}

// This phone's alert settings in the Android admin app.
export async function GET(req: Request) {
  try {
    const user = await requireStaff()
    const installId = installIdFrom(req)
    if (!installId) return json({ error: 'Install id is required' }, { status: 400, headers: noStore })
    const device = await getDevice(installId)
    const mine = device?.userId === user.id ? device : null
    return json({ registered: !!mine, prefs: mine?.prefs ?? DEFAULT_PREFS, hasPushToken: !!mine?.fcmToken, pushConfigured: fcmConfigured() }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load alert settings', 400, noStore) }
}

// Registers this phone for alerts (after sign-in, and whenever Firebase gives it a new token) and
// saves which alerts it wants.
export async function PUT(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { installId?: unknown; fcmToken?: unknown; prefs?: unknown; appVersion?: unknown; model?: unknown }
    const installId = installIdFrom(req, body)
    if (!installId) return json({ error: 'Install id is required' }, { status: 400, headers: noStore })
    const device = await saveDevice(user.id, installId, body)
    return json({ registered: true, prefs: device.prefs, hasPushToken: !!device.fcmToken, pushConfigured: fcmConfigured() }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to save alert settings', 400, noStore) }
}

// A test alert to this person's phones, to prove the set-up works end to end.
export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { test?: unknown }
    if (body.test !== true) return json({ error: 'Unsupported action' }, { status: 400, headers: noStore })
    const result = await pushToStaffApps({ title: 'Test alert', body: 'Alerts from Yalla Haul are working on this phone.', url: '/admin', test: true }, { onlyUserId: user.id })
    return json({ ...result, pushConfigured: fcmConfigured() }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to send a test alert', 400, noStore) }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireStaff()
    const installId = installIdFrom(req)
    if (!installId) return json({ error: 'Install id is required' }, { status: 400, headers: noStore })
    await removeDevice(user.id, installId)
    return json({ ok: true }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to remove this phone', 400, noStore) }
}
