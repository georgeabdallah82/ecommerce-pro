import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { sendEmailVerificationEmail } from '@/lib/email'
import { runInBackground } from '@/lib/background'
import { VERIFY_HOURS, createVerificationToken, siteBase } from '@/lib/email-verification'
import { shopperLang } from '@/lib/message-lang'

const WINDOW_MS = 60 * 60 * 1000
const headers = { 'Cache-Control': 'private, no-store' }

// "Send the link again". Always the same answer, so it does not show whether an address has an account.
export async function POST(request: NextRequest) {
  const ipLimit = await consumeDurableRateLimit(`verify-resend:ip:${clientIp(request.headers)}`, 20, WINDOW_MS)
  if (!ipLimit.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers })

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  const generic = NextResponse.json({ message: 'If that account is waiting for confirmation, we have sent the link again.' }, { headers })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic

  const emailLimit = await consumeDurableRateLimit(`verify-resend:email:${email}`, 3, WINDOW_MS)
  if (!emailLimit.allowed) return generic

  const user = await db.user.findUnique({ where: { email }, select: { id: true, isActive: true, role: true, emailVerifiedAt: true } })
  if (user && user.isActive && user.role === 'CUSTOMER' && !user.emailVerifiedAt) {
    const token = await createVerificationToken(user.id)
    const h = request.headers
    const base = siteBase(h.get('host'), process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL)
    const lang = await shopperLang()
    runInBackground(sendEmailVerificationEmail(email, `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`, VERIFY_HOURS, lang).catch(error => console.error('[verify-resend] email failed', error)))
  }
  return generic
}
