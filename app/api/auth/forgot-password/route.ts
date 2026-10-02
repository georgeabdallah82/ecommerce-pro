import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { sendPasswordResetEmail } from '@/lib/email'
import { runInBackground } from '@/lib/background'

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_IP = 20
const MAX_PER_EMAIL = 3

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers)
  const ipLimit = await consumeDurableRateLimit(`password-recovery:ip:${ip}`, MAX_PER_IP, WINDOW_MS)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { ...headers, 'Retry-After': String(ipLimit.retryAfterSeconds) } })
  }

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  const generic = { message: 'If an account exists, recovery instructions have been sent.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json(generic, { headers })

  const emailLimit = await consumeDurableRateLimit(`password-recovery:email:${email}`, MAX_PER_EMAIL, WINDOW_MS)
  if (!emailLimit.allowed) return NextResponse.json(generic, { headers })

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, isActive: true } })
  if (user?.isActive) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await db.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
      await tx.passwordResetToken.create({ data: { tokenHash, expiresAt, userId: user.id } })
    })

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
    if (appUrl) {
      const resetUrl = `${appUrl.replace(/\/$/, '')}/account/reset-password?token=${encodeURIComponent(token)}`
      runInBackground(sendPasswordResetEmail(user.email, resetUrl, 30).catch(error => console.error('[password-recovery] email delivery failed', error)))
    }
  }

  return NextResponse.json(generic, { headers })
}
