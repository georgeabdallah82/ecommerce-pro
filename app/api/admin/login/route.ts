import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { consumeRateLimit, clearRateLimit } from '@/lib/rate-limit'

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'] as const
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 15
const MAX_PER_EMAIL = 8

// Persistent, cross-instance lockout (backed by the database) in addition to the in-memory
// limiter above. The in-memory limiter only protects a single warm instance; on serverless/edge
// deployments an attacker can spread a brute-force attempt across many instances and bypass it
// entirely, so this is the authoritative guard against distributed credential stuffing.
const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MS = 15 * 60 * 1000

function clientIp(request: Request) {
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') || '').toLowerCase().trim().slice(0, 254)
  const password = String(form.get('password') || '')
  const headers = { 'Cache-Control': 'no-store' }

  if (!email || password.length < 1 || password.length > 128) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  const ipKey = `admin-login:ip:${clientIp(request)}`
  const emailKey = `admin-login:email:${email}`
  const ipLimit = consumeRateLimit(ipKey, MAX_PER_IP, WINDOW_MS)
  const emailLimit = consumeRateLimit(emailKey, MAX_PER_EMAIL, WINDOW_MS)
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)
    return NextResponse.json(
      { error: 'Too many admin login attempts. Please try again later.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } },
    )
  }

  const now = new Date()
  const lockout = await db.adminLoginLockout.findUnique({ where: { email } })
  if (lockout?.lockedUntil && lockout.lockedUntil > now) {
    const retryAfter = Math.ceil((lockout.lockedUntil.getTime() - now.getTime()) / 1000)
    return NextResponse.json(
      { error: 'Too many admin login attempts. Please try again later.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } },
    )
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number]) || !(await verifyPassword(password, user.passwordHash))) {
    const failedCount = (lockout?.failedCount ?? 0) + 1
    const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null
    await db.adminLoginLockout.upsert({
      where: { email },
      create: { email, failedCount, lockedUntil },
      update: { failedCount, lockedUntil },
    })
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  clearRateLimit(emailKey)
  if (lockout && lockout.failedCount > 0) {
    await db.adminLoginLockout.upsert({ where: { email }, create: { email, failedCount: 0, lockedUntil: null }, update: { failedCount: 0, lockedUntil: null } })
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)
  return NextResponse.json({ ok: true }, { headers })
}
