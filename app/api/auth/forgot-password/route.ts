import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_IP = 5
const MAX_PER_EMAIL = 3
const attempts = new Map<string, { count: number; resetAt: number }>()

function limited(key: string, max: number) {
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > max
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(`ip:${ip}`, MAX_PER_IP)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })
  if (limited(`email:${email}`, MAX_PER_EMAIL)) {
    return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, isActive: true } })
  if (user?.isActive) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } })
    console.log(`[password-recovery] reset requested for ${user.email}; configure email delivery to send token securely`)
  }

  return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })
}
