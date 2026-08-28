import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  if (request.headers.get('Render-Health-Check') === '1') {
    return new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  const hasSession = request.cookies.has('session')
  const isApi = request.nextUrl.pathname.startsWith('/api/')
  const isApiMutation = isApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  if (isApiMutation && hasSession && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('X-DNS-Prefetch-Control', 'on')

  if (isApi && hasSession) {
    // Never allow authenticated API responses to become shared-cache entries.
    response.headers.set('Cache-Control', 'private, no-store')
  }

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

export const config = {
  matcher: '/:path*',
}
