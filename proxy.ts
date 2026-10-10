import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { countRedirectHit, findRedirect, getSettingValue, getStaffAccess } from '@/lib/edge-db'
import { isSessionRevoked } from '@/lib/session-revocation'
import { contentSecurityPolicy } from '@/lib/csp'
import { wwwRedirectTarget } from '@/lib/www-redirect'

// '/api' is deliberately NOT in this list (see the maintenance check below) -- API requests get
// their own, narrower bypass so mutations to non-admin/auth/internal/webhook endpoints are
// actually blocked during maintenance instead of silently exempted wholesale.
const MAINTENANCE_BYPASS_PREFIXES = ['/admin', '/coming-soon', '/_next']
const MAINTENANCE_API_BYPASS_PREFIXES = ['/api/admin', '/api/auth', '/api/internal', '/api/payments', '/api/health', '/api/newsletter']
const MAINTENANCE_BYPASS_EXACT = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml'])
// /theme-editor-preview is a staff-only technical surface (the theme editor's iframe target,
// see app/theme-editor-preview/page.tsx), reloaded on every draft edit -- exempting it here
// avoids a redirect-table lookup on every one of those renders, the same way /admin already is.
const REDIRECT_BYPASS_PREFIXES = ['/admin', '/api', '/_next', '/theme-editor-preview']

function isStaticAsset(pathname: string) {
  return /\.[a-zA-Z0-9]+$/.test(pathname)
}

async function isStaffSession(sessionToken: string | undefined) {
  if (!sessionToken || !process.env.AUTH_SECRET) return false
  try {
    const { payload } = await jwtVerify(sessionToken, new TextEncoder().encode(process.env.AUTH_SECRET))
    if (!payload.sub || typeof payload.sub !== 'string') return false
    const user = await getStaffAccess(payload.sub)
    // Same rule as getCurrentUser: a staff session revoked (password/role change, disabled)
    // must not keep previewing the store behind "coming soon".
    if (typeof payload.iat !== 'number' || isSessionRevoked(payload.iat, user?.sessionsRevokedAt)) return false
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

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.headers.get('Render-Health-Check') === '1') {
    return new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  const wwwTarget = wwwRedirectTarget(request.url, request.headers.get('host'))
  if (wwwTarget) return NextResponse.redirect(wwwTarget, 308)

  const pathname = request.nextUrl.pathname
  const nonce = btoa(crypto.randomUUID())
  const isThemePreview = pathname === '/theme-editor-preview'
  // The theme editor's live preview (components/theme-preview-frame.tsx) embeds this one route
  // in a same-origin <iframe>; every other route refuses to be framed.
  const csp = contentSecurityPolicy(nonce, isThemePreview ? "'self'" : "'none'")
  const withNonce = (headers: Headers) => { headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', csp); return headers }
  if (pathname === '/admin/login') {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = '/admin-login'
    const rewrite = NextResponse.rewrite(rewriteUrl, { request: { headers: withNonce(new Headers(request.headers)) } })
    rewrite.headers.set('Content-Security-Policy', csp)
    return rewrite
  }

  const needsRedirectCheck = !REDIRECT_BYPASS_PREFIXES.some(p => pathname.startsWith(p)) && !isStaticAsset(pathname)
  const needsMaintenanceCheck =
    !MAINTENANCE_BYPASS_PREFIXES.some(p => pathname.startsWith(p)) &&
    !MAINTENANCE_BYPASS_EXACT.has(pathname) &&
    !isStaticAsset(pathname)
  // Both lookups run at the same time: a storefront page view used to wait for one database
  // round trip, then a second, before rendering even started.
  // A failed lookup (a brief database/Accelerate hiccup) must not fail the request itself:
  // unhandled, it turned every page and API call into a bare 500 -- checkout showed "Unable
  // to load checkout settings". Treat it as "no redirect" / "not in maintenance" instead.
  const [redirect, maintenanceSetting] = await Promise.all([
    needsRedirectCheck ? findRedirect(pathname).catch(() => null) : null,
    needsMaintenanceCheck ? getSettingValue('maintenance.enabled').catch(() => null) : null,
  ])
  if (needsRedirectCheck) {
    if (redirect) {
      // waitUntil keeps the Worker alive for the counter write after the redirect is sent.
      event.waitUntil(countRedirectHit(redirect.id).then(() => undefined, () => undefined))
      const destination = /^https?:\/\//i.test(redirect.toPath) ? redirect.toPath : new URL(redirect.toPath, request.url)
      return NextResponse.redirect(destination, 308)
    }
  }

  if (needsMaintenanceCheck) {
    if (maintenanceSetting === 'true' && !(await isStaffSession(request.cookies.get('session')?.value))) {
      // Rewriting to /coming-soon is meaningless to an API client, and simply exempting the
      // whole '/api' prefix (as this used to) left checkout/orders/wishlist/reviews fully
      // reachable for non-staff visitors while every storefront page claimed the site wasn't
      // launched yet -- a real order could still be placed, with inventory reserved and a
      // confirmation email sent, during the exact window maintenance mode exists to prevent.
      // Reads stay open (nothing to block there); only state-changing requests to endpoints
      // outside admin/auth/internal-cron/payment-webhook traffic are blocked outright.
      if (pathname.startsWith('/api/')) {
        const isBlockedMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !MAINTENANCE_API_BYPASS_PREFIXES.some(p => pathname.startsWith(p))
        if (isBlockedMutation) {
          return NextResponse.json({ error: 'The store is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
        }
      } else {
        const requestHeaders = withNonce(new Headers(request.headers))
        requestHeaders.set('x-maintenance-active', '1')
        const rewrite = NextResponse.rewrite(new URL('/coming-soon', request.url), { request: { headers: requestHeaders } })
        rewrite.headers.set('Content-Security-Policy', csp)
        return rewrite
      }
    }
  }

  const hasSession = request.cookies.has('session')
  const isApi = pathname.startsWith('/api/')
  const isApiMutation = isApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  if (isApiMutation && hasSession && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const response = NextResponse.next({ request: { headers: withNonce(new Headers(request.headers)) } })
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', isThemePreview ? 'SAMEORIGIN' : 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // geolocation=(self): the storefront's opt-in live-map location prompt (components/live-visitor-tracker.tsx)
  // needs it on our own pages; geolocation=() blocked it outright, so "Allow" could never work.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)')
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('Content-Security-Policy', csp)

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
