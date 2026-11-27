import { SignJWT, jwtVerify } from 'jose'
import { STAFF_SESSION_SECONDS } from '@/lib/session-limits'

// Sign-in for the Yalla Haul Android admin app (android-admin/).
//
// The app cannot rely on the browser's session cookie, so after the same password + 2-step code
// a staff member gets a signed token that the app sends as `Authorization: Bearer <token>`.
// getCurrentUser (lib/auth.ts) accepts it next to the cookie, and every rule the cookie follows
// applies to it unchanged: staff only, 2-step login on, revoked by "sign out everywhere" or a
// password/role change (sessionsRevokedAt), and over after a shift (STAFF_SESSION_SECONDS).
//
// The token has its own type and audience, so a browser session cookie can't be replayed as a
// bearer token and an app token can't be put in a cookie. Nothing secret lives in the app: the
// token is signed with AUTH_SECRET on the server only.

export const MOBILE_AUDIENCE = 'yallahaul-admin-app'
export const MOBILE_TOKEN_TYPE = 'mobile'
export const MOBILE_TICKET_TYPE = 'mobile-two-step'
export const MOBILE_TOKEN_SECONDS = STAFF_SESSION_SECONDS
export const MOBILE_TICKET_SECONDS = 10 * 60

function secret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(raw)
}

// The app's session token, after the password and the 2-step code both checked out.
export async function mobileSessionToken(userId: string) {
  return new SignJWT({ sub: userId, type: MOBILE_TOKEN_TYPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(MOBILE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MOBILE_TOKEN_SECONDS}s`)
    .sign(secret())
}

// Between the password and the code: says whose password was right, for 10 minutes. It is the
// app's equivalent of the web's admin_2step cookie, and opens nothing but the code step.
export async function mobileTwoStepTicket(userId: string) {
  return new SignJWT({ sub: userId, type: MOBILE_TICKET_TYPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(MOBILE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MOBILE_TICKET_SECONDS}s`)
    .sign(secret())
}

export async function readMobileTwoStepTicket(ticket: unknown) {
  if (typeof ticket !== 'string' || !ticket || ticket.length > 2048) return null
  try {
    const { payload } = await jwtVerify(ticket, secret(), { audience: MOBILE_AUDIENCE })
    return payload.type === MOBILE_TICKET_TYPE && typeof payload.sub === 'string' ? payload.sub : null
  } catch { return null }
}

// The bearer token from an Authorization header, or null. Only a well-formed header is read.
export function bearerToken(header: string | null | undefined) {
  const match = /^Bearer\s+([A-Za-z0-9_\-.]{20,2048})$/i.exec(String(header || '').trim())
  return match ? match[1] : null
}

// The claims of a valid app session token: who, and when it was issued (for the revocation and
// shift rules). Anything else -- a browser cookie token, a ticket, an expired or forged token -- is null.
export async function readMobileSession(token: string | null | undefined) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: MOBILE_AUDIENCE })
    if (payload.type !== MOBILE_TOKEN_TYPE || typeof payload.sub !== 'string' || typeof payload.iat !== 'number') return null
    return { sub: payload.sub, iat: payload.iat, exp: typeof payload.exp === 'number' ? payload.exp : null }
  } catch { return null }
}

// The install id the app sends at sign-in (X-Install-Id): 32 URL-safe characters, the same shape
// as the browser's admin_device cookie, so the phone is remembered as one device (lib/sign-in-alerts.ts).
export function cleanInstallId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value) ? value : null
}
