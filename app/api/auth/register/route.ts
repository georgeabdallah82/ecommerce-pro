import { db } from '@/lib/prisma'
import { hashPassword, setSession } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'
import { Role } from '@prisma/client'

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  const ipLimit = consumeRateLimit(`register:ip:${clientIp(req)}`, 10, 60 * 60 * 1000)
  if (!ipLimit.allowed) {
    return json({ error: 'Too many registration attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds), 'Cache-Control': 'no-store' } })
  }

  const b = await req.json().catch(() => ({}))
  const name = String(b.name || '').trim().slice(0, 120)
  const email = String(b.email || '').toLowerCase().trim().slice(0, 254)
  const password = String(b.password || '')
  if (name.length < 2 || !email || password.length < 8) return json({ error: 'Invalid input' }, { status: 400 })
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return json({ error: 'Email already exists' }, { status: 409 })

  const u = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: Role.CUSTOMER,
      isActive: true,
    },
  })
  await setSession(u.id)
  return json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
