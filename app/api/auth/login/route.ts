import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { consumeRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim().slice(0, 254) : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 1 || password.length > 128) {
    return json({ error: 'Invalid credentials' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const ipKey = `login:ip:${clientIp(req)}`
  const emailKey = `login:email:${email}`
  const ipLimit = consumeRateLimit(ipKey, 30, 15 * 60 * 1000)
  const emailLimit = consumeRateLimit(emailKey, 10, 15 * 60 * 1000)
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)
    return json({ error: 'Too many login attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } })
  }

  const u = await db.user.findUnique({ where: { email } })
  if (!u || !u.isActive || !(await verifyPassword(password, u.passwordHash))) {
    return json({ error: 'Invalid credentials' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  clearRateLimit(emailKey)
  await db.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } })
  await setSession(u.id)
  return json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } }, { headers: { 'Cache-Control': 'no-store' } })
}
