import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/prisma'
import { hasPermission, type Permission } from '@/lib/permissions'
import { getStaffRoles, resolvePermissions } from '@/lib/staff-roles'
import { Role } from '@prisma/client'
import { isSessionRevoked } from '@/lib/session-revocation'
import { staffSessionEnded } from '@/lib/session-limits'
import { hasRecentReauth } from '@/lib/reauth'
import { userError } from '@/lib/user-error'

function getSecret() {
  const rawSecret = process.env.AUTH_SECRET
  if (!rawSecret) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(rawSecret)
}

export async function hashPassword(password: string) { return bcrypt.hash(password, 12) }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash) }

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
  if (!token) return null
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
