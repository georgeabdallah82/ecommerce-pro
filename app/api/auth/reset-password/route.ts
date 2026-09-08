import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_IP = 10

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers)
  const limit = consumeRateLimit(`password-reset:ip:${ip}`, MAX_PER_IP, WINDOW_MS)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } })

  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400, headers })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const updated = await db.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true },
    })
    if (!resetToken || resetToken.expiresAt <= new Date()) return false

    const consumed = await tx.passwordResetToken.deleteMany({
      where: { id: resetToken.id, expiresAt: { gt: new Date() } },
    })
    if (consumed.count !== 1) return false

    const passwordHash = await hashPassword(password)
    const changed = await tx.user.updateMany({
      where: { id: resetToken.userId, isActive: true },
      data: { passwordHash },
    })
    return changed.count === 1
  })

  if (!updated) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400, headers })
  return NextResponse.json({ message: 'Password reset successfully. Please sign in again.' }, { headers })
}
