import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { db } from '@/lib/prisma'

const MAINTENANCE_BYPASS_PREFIXES = ['/admin', '/api', '/coming-soon', '/_next']
const MAINTENANCE_BYPASS_EXACT = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml'])

function isStaticAsset(pathname: string) {
  return /\.[a-zA-Z0-9]+$/.test(pathname)
}

async function isStaffSession(sessionToken: string | undefined) {
  if (!sessionToken || !process.env.AUTH_SECRET) return false
  try {
    const { payload } = await jwtVerify(sessionToken, new TextEncoder().encode(process.env.AUTH_SECRET))
    if (!payload.sub || typeof payload.sub !== 'string') return false
    const user = await db.user.findUnique({ where: { id: payload.sub } })
    return !!user?.isActive && user.role !== 'CUSTOMER'
  } catch {
    return false
  }
}

function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host') || request.nextUrl.host
  const proto = forwardedProto || request.nextUrl.protocol.replace(':', '')
  return `${proto}://${host}`
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === getRequestOrigin(request)
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  if (request.headers.get('Render-Health-Check') === '1') {
    return new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  const pathname = request.nextUrl.pathname
  if (pathname === '/admin/login') {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = '/admin-login'
    return NextResponse.rewrite(rewriteUrl)
  }

  const needsMaintenanceCheck =
    !MAINTENANCE_BYPASS_PREFIXES.some(p => pathname.startsWith(p)) &&
    !MAINTENANCE_BYPASS_EXACT.has(pathname) &&
    !isStaticAsset(pathname)
  if (needsMaintenanceCheck) {
    const maintenanceSetting = await db.setting.findUnique({ where: { key: 'maintenance.enabled' } })
    if (maintenanceSetting?.value === 'true' && !(await isStaffSession(request.cookies.get('session')?.value))) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-maintenance-active', '1')
      return NextResponse.rewrite(new URL('/coming-soon', request.url), { request: { headers: requestHeaders } })
    }
  }

  const hasSession = request.cookies.has('session')
  const isApi = pathname.startsWith('/api/')
  const isApiMutation = isApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  if (isApiMutation && hasSession && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // The theme editor's live preview (components/theme-preview-frame.tsx) embeds
  // this one route in a same-origin <iframe>; every other route stays DENY.
  const isThemePreview = pathname === '/admin/online-store/theme-editor/preview'
  response.headers.set('X-Frame-Options', isThemePreview ? 'SAMEORIGIN' : 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('X-DNS-Prefetch-Control', 'on')

  if (isApi && hasSession) {
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
