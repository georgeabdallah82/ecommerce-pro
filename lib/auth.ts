import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/prisma'
import { hasPermission, type Permission } from '@/lib/permissions'
import { getStaffRoles, resolvePermissions } from '@/lib/staff-roles'
import { Role } from '@prisma/client'
import { isSessionRevoked } from '@/lib/session-revocation'
import { staffSessionEnded } from '@/lib/session-limits'
import { hasRecentReauth } from '@/lib/reauth'
import { userError } from '@/lib/user-error'
import { bearerToken, readMobileSession } from '@/lib/mobile-auth'

function getSecret() {
  const rawSecret = process.env.AUTH_SECRET
  if (!rawSecret) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(rawSecret)
}

// Passwords are hashed with scrypt (N=16384, r=8, p=1: each try needs 16 MiB of memory, which slows down cracking
// hardware). Node and Cloudflare's runtime both run it as native code: about 40 ms of CPU. Older accounts have
// bcryptjs hashes (pure JavaScript at cost 12: about 380 ms, far over the Workers Free plan's 10 ms per request).
// Those still verify, and are replaced at the next sign-in (upgradePasswordHash).
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_PREFIX = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`

function scryptKey(password: string, salt: Buffer, keyLength: number, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scryptKey(password, salt, 32, SCRYPT_N, SCRYPT_R, SCRYPT_P)
  return `${SCRYPT_PREFIX}${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, hash: string) {
  if (hash.startsWith('scrypt$')) {
    const parts = hash.split('$')
    if (parts.length !== 6) return false
    const [N, r, p] = parts.slice(1, 4).map(Number)
    // Only settings this code could have written are run: N a power of two, at most 32 MiB of memory, small p.
    if (!Number.isInteger(N) || N < 1024 || (N & (N - 1)) !== 0 || !Number.isInteger(r) || r < 1 || 128 * N * r > 32 * 1024 * 1024) return false
    if (!Number.isInteger(p) || p < 1 || p > 4) return false
    const expected = Buffer.from(parts[5], 'base64')
    if (expected.length < 16 || expected.length > 64) return false
    const actual = await scryptKey(password, Buffer.from(parts[4], 'base64'), expected.length, N, r, p)
    return timingSafeEqual(actual, expected)
  }
  if (/^\$2[aby]\$\d{2}\$/.test(hash)) return bcrypt.compare(password, hash)
  return false
}

// A bcryptjs hash, or scrypt with other settings: replaced the next time the password is checked at sign-in.
export function passwordHashOutdated(hash: string) { return !hash.startsWith(SCRYPT_PREFIX) }

// After a password was checked: stores it the current way. If that fails, it is tried again at the next sign-in.
export async function upgradePasswordHash(userId: string, password: string, hash: string) {
  if (!passwordHashOutdated(hash)) return
  try {
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } })
  } catch (error) {
    console.error('[auth] password hash not upgraded', error instanceof Error ? error.message : error)
  }
}

// The signed session token for an account, and the cookie it is kept in. A route that answers with
// its own redirect (app/api/auth/verify-email) sets the cookie on that response directly.
export async function sessionToken(userId: string) {
  return new SignJWT({ sub: userId, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(getSecret())
}
export const SESSION_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 }

export async function setSession(userId: string) {
  const token = await sessionToken(userId)
  const store = await cookies()
  store.set('session', token, SESSION_COOKIE_OPTIONS)
}

export async function clearSession() {
  const store = await cookies()
  store.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
}

export async function getCurrentUser() {
  const token = (await cookies()).get('session')?.value
  // No browser session: maybe the Android admin app's bearer token (lib/mobile-auth.ts). The cookie path
  // below is left exactly as it was; changing its timing made concurrent checkouts hang on Workers.
  if (!token) return getAppUser()
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (!payload.sub || payload.type !== 'session' || typeof payload.iat !== 'number') return null
    const user = await db.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) return null
    // Staff must have 2-step login on (app/api/admin/login/enroll). A session from before it was required is not enough.
    if (user.role !== 'CUSTOMER' && !user.totpEnabledAt) return null

    // Tokens issued before the account's sessions were revoked (password, email or role
    // change, account disabled) are stale. This used to compare against updatedAt, which
    // every write bumps -- signing in on a second device, paying with wallet/coins or an
    // admin adjusting coins logged the user out everywhere. JWT `iat` is whole seconds while
    // the timestamp has milliseconds, so compare at second precision.
    if (isSessionRevoked(payload.iat, user.sessionsRevokedAt)) return null
    // Staff sign in again after a shift (STAFF_SESSION_SECONDS), so an older staff cookie stops working.
    if (staffSessionEnded(user.role, payload.iat, Math.floor(Date.now() / 1000))) return null

    // Staff on a custom role: load what that role allows (one settings read, staff only).
    const permissions = user.role !== 'CUSTOMER' && user.staffRoleId ? resolvePermissions(user, await getStaffRoles()) : null
    return { ...user, permissions }
  } catch { return null }
}

// The Android admin app's signed-in staff member: the same rules as the cookie above (active, staff with
// 2-step login on, not revoked, within the shift), and never a customer account.
async function getAppUser() {
  const raw = bearerToken((await headers()).get('authorization'))
  if (!raw) return null
  try {
    const payload = await readMobileSession(raw)
    if (!payload) return null
    const user = await db.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) return null
    // The app is for staff only: a customer account never gets in with an app token.
    if (user.role === 'CUSTOMER') return null
    // Staff need 2-step login on, as for the cookie.
    if (!user.totpEnabledAt) return null
    if (isSessionRevoked(payload.iat, user.sessionsRevokedAt)) return null
    if (staffSessionEnded(user.role, payload.iat, Math.floor(Date.now() / 1000))) return null
    const permissions = user.staffRoleId ? resolvePermissions(user, await getStaffRoles()) : null
    return { ...user, permissions }
  } catch { return null }
}

export { isSessionRevoked }

export async function requireUser() { const user = await getCurrentUser(); if (!user) throw new Error('UNAUTHORIZED'); return user }
export async function requireRole(roles: Role[]) { const user = await requireUser(); if (!roles.includes(user.role)) throw new Error('FORBIDDEN'); return user }
// Any signed-in staff member, for settings of their own account (2-step login).
export async function requireStaff() { const user = await requireUser(); if (user.role === 'CUSTOMER') throw new Error('FORBIDDEN'); return user }
// Refunds, role changes and removing a staff member also need the password or a 2-step code from the
// last few minutes (lib/reauth.ts). The REAUTH_REQUIRED code tells the screen to ask the person.
export async function assertRecentSignIn(user: { id: string }) {
  if (!(await hasRecentReauth(user.id))) throw userError('Confirm it is you to continue.', 403, 'REAUTH_REQUIRED')
}
export async function requirePermission(permission: Permission) { const user = await requireUser(); if (!hasPermission(user, permission)) throw new Error('FORBIDDEN'); return user }
