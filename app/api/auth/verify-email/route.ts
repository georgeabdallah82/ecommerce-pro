import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { setSession } from '@/lib/auth'
import { consumeVerificationToken } from '@/lib/email-verification'

// The link from the sign-up email. A good link confirms the address, signs the customer in and opens
// their account. A bad, used or expired link goes to the check-email page, where a new one can be asked for.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const userId = await consumeVerificationToken(token).catch(error => {
    console.error('[verify-email] failed', error)
    return null
  })
  if (!userId) return NextResponse.redirect(new URL('/account/check-email?error=expired', request.url))

  const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } })
  if (!user?.isActive || user.role !== 'CUSTOMER') return NextResponse.redirect(new URL('/account/login?error=invalid', request.url))

  await setSession(userId)
  return NextResponse.redirect(new URL('/account', request.url))
}
