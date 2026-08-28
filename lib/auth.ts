import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/prisma'
import { hasPermission, type Permission } from '@/lib/permissions'
import { Role } from '@prisma/client'

const rawSecret = process.env.AUTH_SECRET || 'dev-secret-change-me-please'
if (process.env.NODE_ENV === 'production' && rawSecret === 'dev-secret-change-me-please') throw new Error('AUTH_SECRET must be configured in production')
const secret = new TextEncoder().encode(rawSecret)

export async function hashPassword(password: string) { return bcrypt.hash(password, 12) }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash) }

export async function setSession(userId: string) {
  const token = await new SignJWT({ sub: userId, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret)
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
    const { payload } = await jwtVerify(token, secret)
    if (!payload.sub || payload.type !== 'session' || typeof payload.iat !== 'number') return null
    const user = await db.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) return null

    // User.updatedAt changes whenever credentials/profile/security-sensitive account
    // state changes. Treat tokens issued before that change as stale. A one-second
    // tolerance accounts for JWT `iat` being second-precision while Prisma timestamps
    // are millisecond-precision.
    const updatedAtSeconds = Math.floor(user.updatedAt.getTime() / 1000)
    if (payload.iat < updatedAtSeconds - 1) return null

    return user
  } catch { return null }
}

export async function requireUser() { const user = await getCurrentUser(); if (!user) throw new Error('UNAUTHORIZED'); return user }
export async function requireRole(roles: Role[]) { const user = await requireUser(); if (!roles.includes(user.role)) throw new Error('FORBIDDEN'); return user }
export async function requirePermission(permission: Permission) { const user = await requireUser(); if (!hasPermission(user.role, permission)) throw new Error('FORBIDDEN'); return user }
