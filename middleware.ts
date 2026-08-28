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

  const isApiMutation = request.nextUrl.pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  if (isApiMutation && request.cookies.has('session') && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('X-DNS-Prefetch-Control', 'on')

  if (request.nextUrl.pathname.startsWith('/api/')) {
    // API responses must not be stored by a shared cache by default. Public,
    // explicitly-cacheable endpoints can override this header at the route level.
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
