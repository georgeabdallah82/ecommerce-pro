import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { consumeRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const email = String(b.email || '').toLowerCase().trim()
  const password = String(b.password || '')
  if (!email || !password) return json({ error: 'Email and password are required' }, { status: 400 })

  const ipKey = `login:ip:${clientIp(req)}`
  const emailKey = `login:email:${email}`
  const ipLimit = consumeRateLimit(ipKey, 30, 15 * 60 * 1000)
  const emailLimit = consumeRateLimit(emailKey, 10, 15 * 60 * 1000)
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)
    return json({ error: 'Too many login attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
  }

  const u = await db.user.findUnique({ where: { email } })
  if (!u || !u.isActive || !(await verifyPassword(password, u.passwordHash))) {
    return json({ error: 'Invalid credentials' }, { status: 401 })
  }

  clearRateLimit(emailKey)
  await db.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } })
  await setSession(u.id)
  return json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } })
}
