import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { upgradePasswordHash, verifyPassword } from '@/lib/auth'
import { consumeDurableRateLimit, clearDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { alertLockout } from '@/lib/sign-in-alerts'
import { mobileTwoStepTicket } from '@/lib/mobile-auth'

// Android admin app sign-in, first step: the password. The same rules as the web's admin sign-in
// (app/api/admin/login/route.ts), and the same counters: the per-IP and per-email limits and the
// lockout are shared with the web, so trying from the app does not give anyone extra attempts.
// A correct password never starts a session by itself: it returns a 10-minute ticket for the
// 2-step code (app/api/mobile/v1/auth/code). Staff who have not set up 2-step login are sent to
// the website to set it up first (the QR code set-up is a web screen).

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'] as const
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 15
const MAX_PER_EMAIL = 8
const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MS = 15 * 60 * 1000
const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown }
  const email = String(body.email ?? '').toLowerCase().trim().slice(0, 254)
  const password = String(body.password ?? '')
  if (!email || password.length < 1 || password.length > 128) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  const ipKey = `admin-login:ip:${clientIp(request.headers)}`
  const emailKey = `admin-login:email:${email}`
  const ipLimit = await consumeDurableRateLimit(ipKey, MAX_PER_IP, WINDOW_MS)
  const emailLimit = await consumeDurableRateLimit(emailKey, MAX_PER_EMAIL, WINDOW_MS)
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)
    return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } })
  }

  const now = new Date()
  const lockout = await db.adminLoginLockout.findUnique({ where: { email } })
  if (lockout?.lockedUntil && lockout.lockedUntil > now) {
    const retryAfter = Math.ceil((lockout.lockedUntil.getTime() - now.getTime()) / 1000)
    return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } })
  }

  const user = await db.user.findUnique({ where: { email } })
  const isStaff = !!user && user.isActive && STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number])
  if (!user || !isStaff || !(await verifyPassword(password, user.passwordHash))) {
    const failedCount = (lockout?.failedCount ?? 0) + 1
    const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null
    await db.adminLoginLockout.upsert({ where: { email }, create: { email, failedCount, lockedUntil }, update: { failedCount, lockedUntil } })
    if (lockedUntil && user && isStaff) await alertLockout(request.headers, user, 'password_lockout')
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  await clearDurableRateLimit(emailKey)
  await upgradePasswordHash(user.id, password, user.passwordHash)
  if (lockout && lockout.failedCount > 0) {
    await db.adminLoginLockout.upsert({ where: { email }, create: { email, failedCount: 0, lockedUntil: null }, update: { failedCount: 0, lockedUntil: null } })
  }
  if (!user.totpEnabledAt || !user.totpSecret) {
    return NextResponse.json({ error: 'Turn on 2-step login first: sign in to the admin on the website once, scan the QR code, then come back to the app.', code: 'ENROLL_REQUIRED' }, { status: 403, headers })
  }
  return NextResponse.json({ needsCode: true, ticket: await mobileTwoStepTicket(user.id) }, { headers })
}
