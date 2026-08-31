import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { consumeRateLimit, clearRateLimit } from '@/lib/rate-limit'

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'] as const
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 15
const MAX_PER_EMAIL = 8

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

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number]) || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401, headers })
  }

  clearRateLimit(emailKey)
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)
  return NextResponse.json({ ok: true }, { headers })
}
