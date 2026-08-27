import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/prisma'

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

  const users = await db.$queryRaw<{ id: string; email: string; isActive: boolean }[]>`
    SELECT id, email, "isActive" FROM "User" WHERE email = ${email} LIMIT 1
  `
  const user = users[0]

  if (user?.isActive) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    const id = crypto.randomUUID()

    await db.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "PasswordResetToken" WHERE "userId" = ${user.id}`
      await tx.$executeRaw`INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt", "createdAt") VALUES (${id}, ${user.id}, ${tokenHash}, ${expiresAt}, NOW())`
    })

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    const resetUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/account/reset-password?token=${encodeURIComponent(token)}` : null
    const webhook = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL

    if (webhook && resetUrl) {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET) headers.authorization = `Bearer ${process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET}`
        await fetch(webhook, { method: 'POST', headers, body: JSON.stringify({ to: user.email, resetUrl, expiresInMinutes: 30 }), signal: AbortSignal.timeout(5000) })
      } catch (error) {
        console.error('[password-recovery] email delivery failed', error)
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[password-recovery] reset URL: ${resetUrl || `token=${token}`}`)
    }
  }

  return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })
}
