// Rules for the storefront's notification popup (components/push-opt-in.tsx) and the
// subscriptions it saves. No server imports: the popup, the API routes and the tests share it.

import { userError } from '@/lib/user-error'

// Our own small "Want offers and order updates?" box comes first; the browser's permission
// prompt only after the visitor taps Yes. Browsers hide or block permission prompts that a
// page fires on its own the moment it opens, and a visitor who says no there can't be asked
// again, so the question is ours first.
export const PUSH_PROMPT_DELAY_MS = 6000
export const PUSH_PROMPT_SNOOZE_DAYS = 30
export const PUSH_PROMPT_DISMISSED_KEY = 'push.prompt.dismissedAt'
// Set once this browser is on the customer list (popup or Account > Notifications).
export const PUSH_PROMPT_SUBSCRIBED_KEY = 'push.prompt.subscribedAt'

// Pages where the popup would be in the way: the admin, checkout (never interrupt a purchase),
// the theme editor's preview, and the account page that already has its own switch.
const QUIET_PATHS = ['/admin', '/checkout', '/theme-editor-preview', '/account/notifications', '/maintenance', '/driver']

export type PushOfferInput = {
  enabled: boolean // Push campaigns > "Ask visitors" switch
  hasKey: boolean // VAPID public key configured
  supported: boolean // service worker + Push API + Notification API in this browser
  permission: string // Notification.permission
  subscribed: boolean // this browser already said yes (PUSH_PROMPT_SUBSCRIBED_KEY)
  pathname: string
  dismissedAt: number | null // when "Not now" was tapped (ms), from localStorage
  now: number
}

export function shouldOfferPush(input: PushOfferInput): boolean {
  if (!input.enabled || !input.hasKey || !input.supported) return false
  // Blocked in the browser: it can't be asked again, and a box that does nothing is worse than none.
  if (input.permission === 'denied' || input.subscribed) return false
  // 'granted' without being on the list (e.g. allowed for the admin's order alerts, or the
  // device was dropped after the browser renewed it) still gets the box: Yes then needs no
  // browser prompt.
  if (QUIET_PATHS.some(path => input.pathname === path || input.pathname.startsWith(`${path}/`))) return false
  if (input.dismissedAt && input.now - input.dismissedAt < PUSH_PROMPT_SNOOZE_DAYS * 86_400_000) return false
  return true
}

// The push services browsers subscribe through (Chrome/Edge/Samsung/Opera: Google; Firefox:
// Mozilla; Safari: Apple; legacy Edge: Windows). A subscription pointing anywhere else isn't a
// real browser's, and campaigns would otherwise send requests to whatever address was posted.
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com']
const PUSH_SERVICE_SUFFIXES = ['.push.apple.com', '.notify.windows.com']

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_HOSTS.includes(host) || PUSH_SERVICE_SUFFIXES.some(suffix => host.endsWith(suffix))
}

export type CleanPushSubscription = { endpoint: string; p256dh: string; auth: string }

// What the browser's PushSubscription.toJSON() gives: { endpoint, keys: { p256dh, auth } }.
export function parsePushSubscription(input: unknown): CleanPushSubscription {
  const value = (input && typeof input === 'object' ? input : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const endpoint = String(value.endpoint ?? '').trim()
  const p256dh = String(value.keys?.p256dh ?? '').trim()
  const auth = String(value.keys?.auth ?? '').trim()
  if (!endpoint || !p256dh || !auth) throw userError('Invalid push subscription')
  if (endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) throw userError('Invalid push subscription')
  if (!/^[A-Za-z0-9_-]+=*$/.test(p256dh) || !/^[A-Za-z0-9_-]+=*$/.test(auth)) throw userError('Invalid push subscription')
  if (!isPushServiceEndpoint(endpoint)) throw userError('Invalid push endpoint')
  return { endpoint, p256dh, auth }
}

// The VAPID public key (base64url) as the bytes PushManager.subscribe() wants.
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

// True when an existing browser subscription was made with this VAPID key (and can be reused:
// the admin's order alerts share it), false when it belongs to an old key and must be replaced.
export function sameApplicationServerKey(existing: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!existing) return false
  const bytes = new Uint8Array(existing)
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i])
}
