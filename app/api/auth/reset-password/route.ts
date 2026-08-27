import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_IP = 10
const attempts = new Map<string, { count: number; resetAt: number }>()

function limited(key: string) {
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > MAX_PER_IP
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } })

  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const rows = await db.$queryRaw<{ id: string; userId: string; expiresAt: Date }[]>`
    SELECT id, "userId", "expiresAt" FROM "PasswordResetToken"
    WHERE "tokenHash" = ${tokenHash} AND "expiresAt" > NOW()
    LIMIT 1
  `
  const resetToken = rows[0]
  if (!resetToken) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })

  const passwordHash = await hashPassword(password)
  const updated = await db.$transaction(async (tx) => {
    const consumed = await tx.$executeRaw`
      DELETE FROM "PasswordResetToken"
      WHERE id = ${resetToken.id} AND "expiresAt" > NOW()
    `
    if (consumed !== 1) return false
    const changed = await tx.user.updateMany({ where: { id: resetToken.userId, isActive: true }, data: { passwordHash } })
    return changed.count === 1
  })

  if (!updated) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  return NextResponse.json({ message: 'Password reset successfully. Please sign in again.' })
}
