import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/prisma'
import { hasPermission, type Permission } from '@/lib/permissions'
import { Role } from '@prisma/client'

function getSecret() {
  const rawSecret = process.env.AUTH_SECRET
  if (!rawSecret) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(rawSecret)
}

export async function hashPassword(password: string) { return bcrypt.hash(password, 12) }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash) }

export async function setSession(userId: string) {
  const token = await new SignJWT({ sub: userId, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(getSecret())
  const store = await cookies()
  store.set('session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 })
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

    // Tokens issued before the account's sessions were revoked (password, email or role
    // change, account disabled) are stale. This used to compare against updatedAt, which
    // every write bumps -- signing in on a second device, paying with wallet/coins or an
    // admin adjusting coins logged the user out everywhere. JWT `iat` is whole seconds while
    // the timestamp has milliseconds, so compare at second precision.
    if (isSessionRevoked(payload.iat, user.sessionsRevokedAt)) return null

    return user
  } catch { return null }
}

// True when a token issued at `issuedAtSeconds` predates the account's last session revocation.
export function isSessionRevoked(issuedAtSeconds: number, sessionsRevokedAt: Date | null | undefined) {
  if (!sessionsRevokedAt) return false
  return issuedAtSeconds < Math.floor(sessionsRevokedAt.getTime() / 1000)
}

export async function requireUser() { const user = await getCurrentUser(); if (!user) throw new Error('UNAUTHORIZED'); return user }
export async function requireRole(roles: Role[]) { const user = await requireUser(); if (!roles.includes(user.role)) throw new Error('FORBIDDEN'); return user }
export async function requirePermission(permission: Permission) { const user = await requireUser(); if (!hasPermission(user.role, permission)) throw new Error('FORBIDDEN'); return user }
