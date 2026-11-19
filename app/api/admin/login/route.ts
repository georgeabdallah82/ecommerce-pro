import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { upgradePasswordHash, verifyPassword } from '@/lib/auth'
import { consumeDurableRateLimit, clearDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { setEnrollTicket, setTwoStepTicket } from '@/lib/two-step'
import { alertLockout } from '@/lib/sign-in-alerts'

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'] as const
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 15
const MAX_PER_EMAIL = 8

// Persistent, cross-instance lockout (backed by the database). The per-IP and per-email limits
// below are durable too, so an attacker cannot spread attempts across Cloudflare Worker isolates,
// each of which starts with an empty in-memory count. The durable limiter keeps a fast in-memory
// check first, so a request that is already over the limit costs nothing extra.
const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MS = 15 * 60 * 1000

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') || '').toLowerCase().trim().slice(0, 254)
  const password = String(form.get('password') || '')
  const headers = { 'Cache-Control': 'no-store' }

  if (!email || password.length < 1 || password.length > 128) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  const ipKey = `admin-login:ip:${clientIp(request.headers)}`
  const emailKey = `admin-login:email:${email}`
  const ipLimit = await consumeDurableRateLimit(ipKey, MAX_PER_IP, WINDOW_MS)
  const emailLimit = await consumeDurableRateLimit(emailKey, MAX_PER_EMAIL, WINDOW_MS)
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
    // Locked by this attempt, and the account is a real staff account: tell the owner.
    if (lockedUntil && user && user.isActive && STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number])) await alertLockout(request.headers, user, 'password_lockout')
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  await clearDurableRateLimit(emailKey)
  await upgradePasswordHash(user.id, password, user.passwordHash)
  if (lockout && lockout.failedCount > 0) {
    await db.adminLoginLockout.upsert({ where: { email }, create: { email, failedCount: 0, lockedUntil: null }, update: { failedCount: 0, lockedUntil: null } })
  }
  // 2-step login on: the password was right, now the code from their phone
  // (app/api/admin/login/code/route.ts). No session until then.
  if (user.totpEnabledAt && user.totpSecret) {
    await setTwoStepTicket(user.id)
    return NextResponse.json({ needsCode: true }, { headers })
  }
  // Staff must turn 2-step login on before they get a session. The password only opens the set-up
  // (app/api/admin/login/enroll), which ends in a session once the first code from the app checks out.
  await setEnrollTicket(user.id)
  return NextResponse.json({ needsEnrollment: true }, { headers })
}
