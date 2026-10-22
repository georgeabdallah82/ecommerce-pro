import { cookies } from 'next/headers'
import { db } from '@/lib/prisma'
import { requireStaff, setSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { countryName } from '@/lib/delivery-countries'
import { json } from '@/lib/utils'
import { DEVICE_COOKIE, SECURITY_EVENT_ACTIONS, describeEvent, devicesKey, hashDevice, isDeviceCookie, parseDevices, touchDevice } from '@/lib/sign-in-devices'
import { requestPlace, securityAlertsOn } from '@/lib/sign-in-alerts'

const noStore = { 'Cache-Control': 'private, no-store' }

// Settings > Security & access > Sign-in alerts: the signed-in staff member's own devices and
// recent security events (lib/sign-in-alerts.ts), "forget a device" and "sign out everywhere".
export async function GET() {
  try {
    const user = await requireStaff()
    const cookie = (await cookies()).get(DEVICE_COOKIE)?.value
    const current = isDeviceCookie(cookie) ? await hashDevice(cookie, user.id) : ''
    const [row, events, alertsOn] = await Promise.all([
      db.setting.findUnique({ where: { key: devicesKey(user.id) } }),
      db.auditLog.findMany({ where: { entity: 'User', entityId: user.id, action: { in: SECURITY_EVENT_ACTIONS } }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, action: true, metadataJson: true, createdAt: true } }),
      securityAlertsOn(),
    ])
    const devices = parseDevices(row?.value).map(d => ({ id: d.id, label: d.label, country: d.country ? countryName(d.country) : '', first: d.first, last: d.last, current: d.id === current }))
    const list = events.map(e => {
      let metadata: unknown = null
      try { metadata = e.metadataJson ? JSON.parse(e.metadataJson) : null } catch {}
      const meta = metadata as { device?: string; country?: string } | null
      return { id: e.id, at: e.createdAt, text: describeEvent(e.action, meta ? { ...meta, country: meta.country ? countryName(meta.country) : '' } : null), warn: e.action.startsWith('admin.lockout') || e.action === 'admin.sign_in.new_device' }
    })
    return json({ alertsOn, devices, events: list }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load security activity') }
}

export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { action?: unknown; id?: unknown }
    const limit = await consumeDurableRateLimit(`security-settings:${user.id}`, 30, 15 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429, headers: noStore })

    if (body.action === 'forget-device') {
      const id = String(body.id || '')
      const key = devicesKey(user.id)
      const row = await db.setting.findUnique({ where: { key } })
      const devices = parseDevices(row?.value)
      if (!devices.some(d => d.id === id)) return json({ error: 'That device is already gone.' }, { status: 404, headers: noStore })
      await db.setting.update({ where: { key }, data: { value: JSON.stringify(devices.filter(d => d.id !== id)) } })
      return json({ ok: true }, { headers: noStore })
    }

    if (body.action === 'sign-out-everywhere') {
      // Every session issued before now stops working; this device gets a fresh one. The list of
      // known devices starts over with this one, so any other device that signs in again (a
      // thief with the password) raises the alert again.
      await db.user.update({ where: { id: user.id }, data: { sessionsRevokedAt: new Date() } })
      await setSession(user.id)
      const cookie = (await cookies()).get(DEVICE_COOKIE)?.value
      const key = devicesKey(user.id)
      const place = requestPlace(req.headers)
      const value = JSON.stringify(isDeviceCookie(cookie) ? touchDevice([], { id: await hashDevice(cookie, user.id), label: place.device, country: place.country }, new Date()).devices : [])
      await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      await audit(user.id, 'user.sessions_revoked', 'User', user.id)
      return json({ ok: true }, { headers: noStore })
    }

    return json({ error: 'Unknown action' }, { status: 400, headers: noStore })
  } catch (error) { return routeError(error, 'Unable to update security settings') }
}
