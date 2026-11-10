import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { sessionToken, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { consumeVerificationToken } from '@/lib/email-verification'

// A redirect to a path on the same host the browser used. The host is not rebuilt from the request URL,
// because that can differ from the address the browser is on (a cookie set for one host is not sent to another).
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}

// The link from the sign-up email. A good link confirms the address, signs the customer in and opens
// their account. A bad, used or expired link goes to the check-email page, where a new one can be asked for.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const userId = await consumeVerificationToken(token).catch(error => {
    console.error('[verify-email] failed', error)
    return null
  })
  if (!userId) return redirectTo('/account/check-email?error=expired')

  const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } })
  if (!user?.isActive || user.role !== 'CUSTOMER') return redirectTo('/account/login?error=invalid')

  // The session cookie goes on this redirect itself, so the browser keeps it when it follows the redirect.
  const response = redirectTo('/account')
  response.cookies.set('session', await sessionToken(userId), SESSION_COOKIE_OPTIONS)
  return response
}
