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
  const passwordHash = await hashPassword(password)
  const updated = await db.$transaction(async (tx) => {
    // Find only unexpired tokens. The row is then consumed atomically with the
    // password update so a token can never be successfully reused.
    const resetToken = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true },
    })
    if (!resetToken || resetToken.expiresAt <= new Date()) return false

    const consumed = await tx.passwordResetToken.deleteMany({
      where: { id: resetToken.id, expiresAt: { gt: new Date() } },
    })
    if (consumed.count !== 1) return false

    const changed = await tx.user.updateMany({
      where: { id: resetToken.userId, isActive: true },
      data: { passwordHash },
    })
    return changed.count === 1
  })

  if (!updated) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  return NextResponse.json({ message: 'Password reset successfully. Please sign in again.' })
}
