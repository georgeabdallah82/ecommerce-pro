// Sign-in alerts for the admin (lib/sign-in-alerts.ts). A browser that signed in before is
// remembered by a random id in a cookie (admin_device); only a hash of the id is stored, as a
// small list per account in Settings. A browser not in the list is a "new device": the owner
// is told by email and phone notification, so a stolen password gets noticed within minutes.

export const DEVICE_COOKIE = 'admin_device'
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
export const MAX_DEVICES = 12
export const devicesKey = (userId: string) => `security.devices.${userId}`

export type KnownDevice = { id: string; label: string; country: string; first: string; last: string }

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const isDeviceCookie = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value)

export function newDeviceCookie() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)))
}

// Only this hash is stored, so the list is useless to anyone who reads the database.
export async function hashDevice(cookieValue: string, userId: string) {
  const bytes = new TextEncoder().encode(`${userId}:${cookieValue}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest.slice(0, 12), b => b.toString(16).padStart(2, '0')).join('')
}

// "Chrome on Android": enough for the owner to say "that's my phone" or "that's not me".
export function describeDevice(userAgent: string | null | undefined) {
  const ua = String(userAgent || '')
  if (!ua) return 'Unknown device'
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /CrOS/i.test(ua) ? 'Chromebook' : /Linux/i.test(ua) ? 'Linux' : ''
  const browser = /Edg(e|A|iOS)?\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : ''
  if (browser && os) return `${browser} on ${os}`
  return browser || os || 'Unknown device'
}

export function parseDevices(raw: string | null | undefined): KnownDevice[] {
  try {
    const list = JSON.parse(raw || '[]')
    if (!Array.isArray(list)) return []
    return list.flatMap((d: any) => d && typeof d.id === 'string' && typeof d.label === 'string'
      ? [{ id: d.id, label: d.label.slice(0, 60), country: String(d.country || '').slice(0, 2).toUpperCase(), first: String(d.first || ''), last: String(d.last || '') }]
      : [])
  } catch { return [] }
}

// Adds or refreshes the browser in the list. A new one goes first; the list keeps the 12 most
// recently used, so an old forgotten device drops off by itself.
export function touchDevice(list: KnownDevice[], device: { id: string; label: string; country: string }, now: Date) {
  const stamp = now.toISOString()
  const known = list.find(d => d.id === device.id)
  const entry: KnownDevice = known
    ? { ...known, label: device.label, country: device.country || known.country, last: stamp }
    : { id: device.id, label: device.label, country: device.country, first: stamp, last: stamp }
  const rest = list.filter(d => d.id !== device.id)
  const devices = [entry, ...rest].sort((a, b) => b.last.localeCompare(a.last)).slice(0, MAX_DEVICES)
  return { devices, isNew: !known }
}

export type SecurityAlertKind = 'new_device' | 'password_lockout' | 'code_lockout'

export type SecurityAlert = {
  kind: SecurityAlertKind
  who: string
  device?: string
  country?: string
  ip?: string
  at: Date
  firstSignIn?: boolean
}

const when = (at: Date) => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`

// The words of the alert, shared by the phone notification and the email.
export function securityAlertText(alert: SecurityAlert) {
  const place = [alert.device, alert.country].filter(Boolean).join(' · ')
  if (alert.kind === 'new_device') {
    return {
      subject: `New sign-in to your admin${alert.device ? `: ${alert.device}` : ''}`,
      push: { title: 'New sign-in to your admin', body: `${alert.who}${place ? ` · ${place}` : ''}. Not you? Open Settings > Security.` },
      lines: [
        `Someone signed in to the admin as ${alert.who} from a device it had not seen before.`,
        ...(place ? [`Device: ${place}`] : []),
        `Time: ${when(alert.at)}`,
        ...(alert.firstSignIn ? ['This is the first sign-in since sign-in alerts were turned on, so your own phone or computer shows up once.'] : []),
        'If this was you, there is nothing to do. This device is remembered now.',
        'If it was not you, change your password now and use "Sign out everywhere" in Settings > Security & access.',
      ],
    }
  }
  if (alert.kind === 'password_lockout') {
    return {
      subject: `Someone is guessing the password for ${alert.who}`,
      push: { title: 'Wrong passwords for your admin', body: `Many wrong passwords for ${alert.who}. The account is locked for 15 minutes.` },
      lines: [
        `The admin password for ${alert.who} was entered wrong many times in a row. The account is locked for 15 minutes.`,
        ...(place ? [`From: ${place}`] : []),
        `Time: ${when(alert.at)}`,
        'If this was you, wait 15 minutes. If it was not, use a long password that you use nowhere else, and keep 2-step login on.',
      ],
    }
  }
  return {
    subject: `Wrong 2-step codes for ${alert.who}`,
    push: { title: 'Wrong 2-step codes', body: `Someone knew the password for ${alert.who} but could not give the 2-step code. Locked 15 minutes.` },
    lines: [
      `Someone typed the right password for ${alert.who} but gave the wrong 2-step code several times. The account is locked for 15 minutes. They did not get in.`,
      ...(place ? [`From: ${place}`] : []),
      `Time: ${when(alert.at)}`,
      'Your password may have leaked. Change it now in Settings > Security & access.',
    ],
  }
}

// Events shown under "Recent activity" in Settings > Security & access.
export const SECURITY_EVENT_ACTIONS = ['admin.sign_in', 'admin.sign_in.new_device', 'admin.lockout', 'admin.lockout.code', 'user.sessions_revoked', 'user.two_step_backup_code_used']

export function describeEvent(action: string, metadata: any) {
  const place = [metadata?.device, metadata?.country].filter(Boolean).join(' · ')
  switch (action) {
    case 'admin.sign_in': return `Signed in${place ? ` · ${place}` : ''}`
    case 'admin.sign_in.new_device': return `Signed in from a new device${place ? ` · ${place}` : ''}`
    case 'admin.lockout': return `Locked after wrong passwords${place ? ` · ${place}` : ''}`
    case 'admin.lockout.code': return `Locked after wrong 2-step codes${place ? ` · ${place}` : ''}`
    case 'user.sessions_revoked': return 'Signed out everywhere'
    case 'user.two_step_backup_code_used': return 'A backup code was used to sign in'
    default: return action
  }
}
