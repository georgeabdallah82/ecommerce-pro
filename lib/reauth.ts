import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// A recent confirmation by the signed-in person: their password, or a code from their 2-step app.
// Refunds, role changes and removing a staff member need one from the last few minutes (see
// assertRecentSignIn in lib/auth.ts). It lives in its own short cookie and is tied to the account.
export const REAUTH_SECONDS = 10 * 60
export const REAUTH_COOKIE = 'admin_reauth'
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }

function secret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(raw)
}

export async function setReauth(userId: string) {
  const token = await new SignJWT({ sub: userId, type: 'reauth' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${REAUTH_SECONDS}s`).sign(secret())
  ;(await cookies()).set(REAUTH_COOKIE, token, { ...cookieOptions, maxAge: REAUTH_SECONDS })
}

// True when the token was issued for this account and has not expired. Kept apart from the cookie
// read, so it can be tested on its own.
export function isFreshReauth(payload: { sub?: unknown; type?: unknown; exp?: unknown }, userId: string, nowSeconds: number) {
  return payload.type === 'reauth' && payload.sub === userId && typeof payload.exp === 'number' && payload.exp > nowSeconds
}

export async function hasRecentReauth(userId: string) {
  const token = (await cookies()).get(REAUTH_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, secret())
    return isFreshReauth(payload, userId, Math.floor(Date.now() / 1000))
  } catch {
    return false
  }
}
