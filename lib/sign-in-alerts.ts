import { cookies } from 'next/headers'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { clientIp } from '@/lib/request-ip'
import { countryName } from '@/lib/delivery-countries'
import { sendSecurityAlertEmail } from '@/lib/email'
import { sendSecurityAlertPush } from '@/lib/push'
import {
  DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, devicesKey, hashDevice, isDeviceCookie, describeDevice,
  newDeviceCookie, parseDevices, securityAlertText, touchDevice, type SecurityAlert, type SecurityAlertKind,
} from '@/lib/sign-in-devices'

// Sign-in alerts (lib/sign-in-devices.ts): called after a staff member is fully signed in, and
// when an account gets locked by wrong passwords or wrong 2-step codes. Nothing here may stop a
// sign-in: every failure is logged and swallowed.

type Person = { id: string; email: string; name?: string | null }
type Header = { get(name: string): string | null }

export async function securityAlertsOn() {
  return (await db.setting.findUnique({ where: { key: 'notifications.security' } }))?.value !== 'false'
}

export function requestPlace(headers: Header) {
  const code = String(headers.get('cf-ipcountry') || '').trim().toUpperCase()
  const country = /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : ''
  const ip = clientIp(headers)
  return { device: describeDevice(headers.get('user-agent')), country, ip: ip === 'unknown' ? '' : ip }
}

// Who hears about it: the person whose account it is, every super admin, and the store's own
// notification address (the one the morning summary goes to). Duplicates and the demo address
// from the starter data are left out.
export async function securityRecipients(user: Person) {
  const [admins, settings] = await Promise.all([
    db.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, email: true } }),
    db.setting.findMany({ where: { key: { in: ['notifications.summaryEmail', 'contact.email'] } }, select: { key: true, value: true } }),
  ])
  const map = new Map(settings.map(s => [s.key, s.value.trim()]))
  const emails = [...new Set([user.email, ...admins.map(a => a.email), map.get('notifications.summaryEmail') || map.get('contact.email') || '']
    .map(e => String(e || '').trim().toLowerCase())
    .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !e.endsWith('@example.com')))].slice(0, 6)
  return { emails, userIds: [...new Set([user.id, ...admins.map(a => a.id)])] }
}

async function notify(alert: SecurityAlert, user: Person) {
  try {
    if (!(await securityAlertsOn())) return
    const { emails, userIds } = await securityRecipients(user)
    const text = securityAlertText(alert)
    await Promise.allSettled([
      ...emails.map(to => sendSecurityAlertEmail(to, alert)),
      sendSecurityAlertPush(userIds, text.push),
    ])
  } catch (error) { console.error('[security] alert failed', error) }
}

// A staff member just signed in (password, and the 2-step code if they use it). Remembers the
// browser and, if it is a new one, tells the owner.
export async function recordSignIn(headers: Header, user: Person) {
  try {
    const store = await cookies()
    const existing = store.get(DEVICE_COOKIE)?.value
    const cookie = isDeviceCookie(existing) ? existing : newDeviceCookie()
    store.set(DEVICE_COOKIE, cookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DEVICE_COOKIE_MAX_AGE })
    await rememberDevice(headers, user, cookie)
  } catch (error) { console.error('[security] could not record the sign-in', error) }
}

// A staff member signed in on the Android admin app (app/api/mobile/v1/auth/code). The app's own install id stands in
// for the browser cookie, so the phone is one known device and a new phone tells the owner, the same as a new browser.
export async function recordAppSignIn(headers: Header, user: Person, installId: string) {
  try {
    if (!isDeviceCookie(installId)) return
    await rememberDevice(headers, user, installId, 'Yalla Haul Admin app (Android)')
  } catch (error) { console.error('[security] could not record the app sign-in', error) }
}

async function rememberDevice(headers: Header, user: Person, cookie: string, labelPrefix = '') {
  const found = requestPlace(headers)
  // The app's own requests say little about the phone ("Android"), so the app is named plainly.
  const place = labelPrefix ? { ...found, device: labelPrefix } : found
  const id = await hashDevice(cookie, user.id)
  const key = devicesKey(user.id)
  const row = await db.setting.findUnique({ where: { key } })
  const before = parseDevices(row?.value)
  const at = new Date()
  const { devices, isNew } = touchDevice(before, { id, label: place.device, country: place.country }, at)
  const value = JSON.stringify(devices)
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  await audit(user.id, isNew ? 'admin.sign_in.new_device' : 'admin.sign_in', 'User', user.id, { device: place.device, country: place.country, ip: place.ip })
  if (isNew) {
    const alert: SecurityAlert = { kind: 'new_device', who: user.name ? `${user.name} (${user.email})` : user.email, device: place.device, country: place.country ? countryName(place.country) : '', ip: place.ip, at, firstSignIn: before.length === 0 }
    runInBackground(notify(alert, user))
  }
}

// An account was locked: 8 wrong passwords, or 6 wrong 2-step codes after the right password.
export async function alertLockout(headers: Header, user: Person, kind: Exclude<SecurityAlertKind, 'new_device'>) {
  try {
    const place = requestPlace(headers)
    await audit(user.id, kind === 'password_lockout' ? 'admin.lockout' : 'admin.lockout.code', 'User', user.id, { device: place.device, country: place.country, ip: place.ip })
    const alert: SecurityAlert = { kind, who: user.email, device: place.device, country: place.country ? countryName(place.country) : '', ip: place.ip, at: new Date() }
    runInBackground(notify(alert, user))
  } catch (error) { console.error('[security] could not record the lockout', error) }
}
