import { SignJWT, importPKCS8 } from 'jose'

// Firebase Cloud Messaging (HTTP v1) for the Android admin app's alerts (lib/mobile-devices.ts).
//
// The server holds the Firebase service account in the FCM_SERVICE_ACCOUNT_JSON secret (a
// Cloudflare Worker secret, never in the repository and never in the app). Without it every send
// is skipped quietly: the app then picks alerts up by checking the alert history every 15 minutes.
//
// Messages are data-only with high priority, so the app builds the notification itself, on the
// channel the person chose, whether it is open or not.

type ServiceAccount = { project_id: string; client_email: string; private_key: string }
type CachedToken = { token: string; expiresAt: number; email: string }

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
let cached: CachedToken | null = null

export function readServiceAccount(raw = process.env.FCM_SERVICE_ACCOUNT_JSON): ServiceAccount | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null
    return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, '\n') }
  } catch { return null }
}

export function fcmConfigured() { return readServiceAccount() !== null }

async function accessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.email === account.client_email && cached.expiresAt - 60 > now) return cached.token
  const key = await importPKCS8(account.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!response.ok) throw new Error(`FCM token request failed (${response.status})`)
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('FCM token response had no access token')
  cached = { token: body.access_token, expiresAt: now + Math.min(3600, Number(body.expires_in) || 3600), email: account.client_email }
  return cached.token
}

// FCM data values must all be strings.
export function fcmData(payload: Record<string, unknown>) {
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    data[key] = typeof value === 'string' ? value.slice(0, 1000) : JSON.stringify(value).slice(0, 1000)
  }
  return data
}

// 'gone' means the app was uninstalled or the token was replaced: the caller forgets the device.
export type FcmResult = 'sent' | 'gone' | 'failed' | 'skipped'

export async function sendFcm(token: string, data: Record<string, string>, ttlSeconds = 300): Promise<FcmResult> {
  const account = readServiceAccount()
  if (!account) return 'skipped'
  try {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken(account)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token, data, android: { priority: 'HIGH', ttl: `${ttlSeconds}s` } } }),
    })
    if (response.ok) return 'sent'
    const text = await response.text().catch(() => '')
    if (response.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text)) return 'gone'
    if (response.status === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text)) return 'gone'
    if (response.status === 401) cached = null
    console.error('[fcm] send failed', { status: response.status })
    return 'failed'
  } catch (error) {
    console.error('[fcm] send failed', error instanceof Error ? error.message : 'unknown error')
    return 'failed'
  }
}
