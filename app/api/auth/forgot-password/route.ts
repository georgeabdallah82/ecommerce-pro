import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rate-limit'

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_IP = 5
const MAX_PER_EMAIL = 3

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipLimit = consumeRateLimit(`password-recovery:ip:${ip}`, MAX_PER_IP, WINDOW_MS)
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } })
  }

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })

  const emailLimit = consumeRateLimit(`password-recovery:email:${email}`, MAX_PER_EMAIL, WINDOW_MS)
  if (!emailLimit.allowed) {
    return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, isActive: true } })

  if (user?.isActive) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await db.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
      await tx.passwordResetToken.create({
        data: { tokenHash, expiresAt, userId: user.id },
      })
    })

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
    const resetUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/account/reset-password?token=${encodeURIComponent(token)}` : null
    const webhook = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL

    if (webhook && resetUrl) {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET) headers.authorization = `Bearer ${process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET}`
        const response = await fetch(webhook, {
          method: 'POST',
          headers,
          body: JSON.stringify({ to: user.email, resetUrl, expiresInMinutes: 30 }),
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) console.error('[password-recovery] email delivery rejected', response.status)
      } catch (error) {
        console.error('[password-recovery] email delivery failed', error)
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[password-recovery] reset URL: ${resetUrl || `token=${token}`}`)
    }
  }

  return NextResponse.json({ message: 'If an account exists, recovery instructions have been sent.' })
}
