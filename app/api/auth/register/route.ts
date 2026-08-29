import { db } from '@/lib/prisma'
import { hashPassword, setSession } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'
import { Role } from '@prisma/client'

function clientIp(req: Request) {
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(req: Request) {
  const ipLimit = consumeRateLimit(`register:ip:${clientIp(req)}`, 10, 60 * 60 * 1000)
  if (!ipLimit.allowed) {
    return json({ error: 'Too many registration attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds), 'Cache-Control': 'no-store' } })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
    return json({ error: 'Invalid input' }, { status: 400 })
  }

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) return json({ error: 'Email already exists' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Unique constraint') || message.includes('Unique constraint failed')) {
      return json({ error: 'Email already exists' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    console.error('[auth/register] failed', error)
    return json({ error: 'Unable to create account' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
