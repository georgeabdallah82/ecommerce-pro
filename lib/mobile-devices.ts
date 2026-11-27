import { createHash } from 'node:crypto'
import { db } from '@/lib/prisma'
import { fcmData, sendFcm } from '@/lib/fcm'

// The phones running the Android admin app (android-admin/), and the alerts they get.
//
// Like the browsers that turned on order alerts (lib/push.ts), each phone is a Setting row, so the
// app needed no new table. One row per app install: signing in as someone else on the same phone
// replaces it. A row holds who is signed in, the phone's Firebase token (when Firebase is set up),
// and which kinds of alerts the person wants on that phone.
//
// Every staff alert lib/push.ts sends also goes to these phones (pushToStaffApps), after the same
// store-wide switches (Settings > Notifications), and is kept as the person's alert history
// (Notification rows of type "staff.<kind>|<path>"), which the app lists and, without Firebase,
// checks every 15 minutes to show alerts itself.

export const DEVICE_PREFIX = 'mobile.device.'
export const STAFF_ALERT_TYPE_PREFIX = 'staff.'
export const ALERT_KINDS = ['orders', 'lowStock', 'messages', 'security', 'summary'] as const
export type AlertKind = typeof ALERT_KINDS[number]
export type AlertPrefs = Record<AlertKind, boolean>
export const DEFAULT_PREFS: AlertPrefs = { orders: true, lowStock: true, messages: true, security: true, summary: true }
const HISTORY_DAYS = 30

export type MobileDevice = { userId: string; installId: string; fcmToken: string | null; prefs: AlertPrefs; appVersion: string; model: string; updatedAt: string }

export const deviceKey = (installId: string) => DEVICE_PREFIX + createHash('sha256').update(installId).digest('hex').slice(0, 40)

export function cleanPrefs(input: unknown, base: AlertPrefs = DEFAULT_PREFS): AlertPrefs {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const prefs = { ...base }
  for (const kind of ALERT_KINDS) if (typeof source[kind] === 'boolean') prefs[kind] = source[kind] as boolean
  return prefs
}

export function parseDevice(raw: string | null | undefined): MobileDevice | null {
  try {
    const value = JSON.parse(String(raw || '')) as Partial<MobileDevice>
    if (!value.userId || !value.installId) return null
    return { userId: value.userId, installId: value.installId, fcmToken: value.fcmToken || null, prefs: cleanPrefs(value.prefs), appVersion: String(value.appVersion || ''), model: String(value.model || ''), updatedAt: String(value.updatedAt || '') }
  } catch { return null }
}

const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max)
export const cleanFcmToken = (value: unknown) => { const token = cleanText(value, 4096); return /^[A-Za-z0-9_:\-.]{20,4096}$/.test(token) ? token : null }

export async function getDevice(installId: string) {
  const row = await db.setting.findUnique({ where: { key: deviceKey(installId) } })
  return parseDevice(row?.value)
}

// Saves this phone for the signed-in person. A Firebase token that another install held is taken
// off that one, so one phone never gets an alert twice.
export async function saveDevice(userId: string, installId: string, input: { fcmToken?: unknown; prefs?: unknown; appVersion?: unknown; model?: unknown }) {
  const existing = await getDevice(installId)
  const sameUser = existing?.userId === userId
  const fcmToken = input.fcmToken === undefined ? (sameUser ? existing?.fcmToken ?? null : null) : cleanFcmToken(input.fcmToken)
  const device: MobileDevice = {
    userId, installId, fcmToken,
    prefs: cleanPrefs(input.prefs, sameUser && existing ? existing.prefs : DEFAULT_PREFS),
    appVersion: input.appVersion === undefined ? existing?.appVersion || '' : cleanText(input.appVersion, 40),
    model: input.model === undefined ? existing?.model || '' : cleanText(input.model, 80),
    updatedAt: new Date().toISOString(),
  }
  const key = deviceKey(installId)
  const value = JSON.stringify(device)
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  if (fcmToken) {
    const others = await listDevices()
    await Promise.all(others.filter(o => o.key !== key && o.device.fcmToken === fcmToken).map(o => db.setting.deleteMany({ where: { key: o.key } })))
  }
  return device
}

// Signing out on the phone: its row goes, but only if it is the signed-in person's own.
export async function removeDevice(userId: string, installId: string) {
  const key = deviceKey(installId)
  const device = await getDevice(installId)
  if (!device || device.userId !== userId) return false
  await db.setting.deleteMany({ where: { key } })
  return true
}

export async function removeAllDevicesFor(userId: string) {
  const devices = await listDevices()
  await Promise.all(devices.filter(d => d.device.userId === userId).map(d => db.setting.deleteMany({ where: { key: d.key } })))
}

async function listDevices() {
  const rows = await db.setting.findMany({ where: { key: { startsWith: DEVICE_PREFIX } }, select: { key: true, value: true } })
  return rows.flatMap(row => { const device = parseDevice(row.value); return device ? [{ key: row.key, device }] : [] })
}

// Which kind of alert a lib/push.ts payload is, by the flags each sender sets.
export function alertKind(payload: Record<string, unknown>): AlertKind | null {
  if (payload.test) return null
  if (payload.security) return 'security'
  if (payload.lowStock) return 'lowStock'
  if (payload.dailySummary) return 'summary'
  if (payload.orderProblem || payload.orderId || payload.orderNumber) return 'orders'
  return 'messages'
}

// The app screen an admin link opens (the app understands these paths): an order, inventory...
export function appPath(url: unknown) {
  const path = typeof url === 'string' && url.startsWith('/') ? url.slice(0, 300) : '/admin'
  return /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(path) ? path : '/admin'
}

export const staffAlertType = (kind: AlertKind, path: string) => `${STAFF_ALERT_TYPE_PREFIX}${kind}|${path}`
export function parseStaffAlertType(type: string) {
  if (!type.startsWith(STAFF_ALERT_TYPE_PREFIX)) return null
  const [kind, ...rest] = type.slice(STAFF_ALERT_TYPE_PREFIX.length).split('|')
  return (ALERT_KINDS as readonly string[]).includes(kind) ? { kind: kind as AlertKind, path: appPath(rest.join('|')) } : null
}

type Filter = { onlyUserId?: string; allowedUserIds?: string[] | null }

// Called by lib/push.ts for every staff alert. Never throws: an alert must not disturb the order,
// sign-in or stock change that caused it.
export async function pushToStaffApps(payload: Record<string, unknown>, filter: Filter = {}) {
  try {
    const kind = alertKind(payload)
    const devices = await listDevices()
    if (!devices.length) return { sent: 0, failed: 0 }
    const staff = await db.user.findMany({ where: { id: { in: [...new Set(devices.map(d => d.device.userId))] }, isActive: true, role: { not: 'CUSTOMER' } }, select: { id: true } })
    const active = new Set(staff.map(s => s.id))
    const allowed = filter.allowedUserIds?.length ? new Set(filter.allowedUserIds) : null
    const targets = devices.filter(({ device }) => active.has(device.userId)
      && (!filter.onlyUserId || device.userId === filter.onlyUserId)
      && (!allowed || allowed.has(device.userId))
      && (kind === null || device.prefs[kind]))
    const title = cleanText(payload.title, 120) || 'Yalla Haul'
    const body = cleanText(payload.body, 400)
    const path = appPath(payload.url)

    // The history: one row per person (not per phone), kept 30 days. Test alerts are not kept.
    if (kind) {
      const people = [...new Set(targets.map(t => t.device.userId))]
      if (people.length) {
        const type = staffAlertType(kind, path)
        await db.notification.createMany({ data: people.map(userId => ({ userId, title, body, type })) })
        const cutoff = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000)
        await db.notification.deleteMany({ where: { userId: { in: people }, type: { startsWith: STAFF_ALERT_TYPE_PREFIX }, createdAt: { lt: cutoff } } })
      }
    }

    let sent = 0; let failed = 0
    const data = fcmData({ title, body, path, kind: kind || 'test', tag: payload.tag, orderId: payload.orderId })
    await Promise.all(targets.filter(t => t.device.fcmToken).map(async ({ key, device }) => {
      const result = await sendFcm(device.fcmToken!, data, kind === 'summary' ? 3600 : 300)
      if (result === 'sent') sent += 1
      else if (result === 'failed') failed += 1
      else if (result === 'gone') {
        // The app was uninstalled or its token replaced: keep the sign-in, forget the token.
        await db.setting.updateMany({ where: { key }, data: { value: JSON.stringify({ ...device, fcmToken: null }) } }).catch(() => undefined)
      }
    }))
    return { sent, failed }
  } catch (error) {
    console.error('[mobile] staff app alert failed', error instanceof Error ? error.message : error)
    return { sent: 0, failed: 1 }
  }
}
