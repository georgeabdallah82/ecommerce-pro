import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { countRedirectHit, findRedirect, getSettingValue, getStaffAccess } from '@/lib/edge-db'
import { isSessionRevoked } from '@/lib/session-revocation'
import { staffSessionEnded } from '@/lib/session-limits'
import { contentSecurityPolicy } from '@/lib/csp'
import { httpsRedirectTarget, wwwRedirectTarget } from '@/lib/www-redirect'
import { CAMERA_PATHS, applySecurityHeaders } from '@/lib/security-headers'
import { isBlockedDuringMaintenance, skipsMaintenanceCheck } from '@/lib/maintenance-paths'

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
    if (!payload.sub || typeof payload.sub !== 'string' || payload.type !== 'session') return false
    const user = await getStaffAccess(payload.sub)
    // Same rule as getCurrentUser: a staff session revoked (password/role change, disabled)
    // must not keep seeing the store behind the maintenance page.
    if (typeof payload.iat !== 'number' || isSessionRevoked(payload.iat, user?.sessionsRevokedAt)) return false
    // Staff sign in again after a shift (lib/session-limits.ts), the same rule as getCurrentUser.
    if (staffSessionEnded(user?.role ?? 'CUSTOMER', payload.iat, Math.floor(Date.now() / 1000))) return false
    // Staff need 2-step login on, the same rule as getCurrentUser.
    return !!user?.isActive && user.role !== 'CUSTOMER' && !!user.totpEnabled
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

  const httpsTarget = httpsRedirectTarget(request.url, { host: request.headers.get('host'), cfVisitor: request.headers.get('cf-visitor'), forwardedProto: request.headers.get('x-forwarded-proto') })
  if (httpsTarget) return NextResponse.redirect(httpsTarget, 308)
  const wwwTarget = wwwRedirectTarget(request.url, request.headers.get('host'))
  if (wwwTarget) return NextResponse.redirect(wwwTarget, 308)

  const pathname = request.nextUrl.pathname
  // A path with broken percent-encoding (for example /product/%E0%A4%A) matches no page, and Next answers it with a
  // bare 500 while it matches the route. Show the normal not-found page instead, before any route is matched.
  try { decodeURIComponent(pathname) } catch { return NextResponse.rewrite(new URL('/not-found-page', request.url)) }
  const nonce = btoa(crypto.randomUUID())
  const isThemePreview = pathname === '/theme-editor-preview'
  // The theme editor's live preview (components/theme-preview-frame.tsx) embeds this one route
  // in a same-origin <iframe>; every other route refuses to be framed.
  const csp = contentSecurityPolicy(nonce, isThemePreview ? "'self'" : "'none'")
  // x-pathname: the storefront's language is decided per page (admin pages stay English, lib/i18n-server.ts).
  const withNonce = (headers: Headers) => { headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', csp); headers.set('x-pathname', pathname); return headers }
  if (pathname === '/admin/login') {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = '/admin-login'
    const rewrite = NextResponse.rewrite(rewriteUrl, { request: { headers: withNonce(new Headers(request.headers)) } })
    rewrite.headers.set('Content-Security-Policy', csp)
    return applySecurityHeaders(rewrite)
  }

  const needsRedirectCheck = !REDIRECT_BYPASS_PREFIXES.some(p => pathname.startsWith(p)) && !isStaticAsset(pathname)
  const needsMaintenanceCheck = !skipsMaintenanceCheck(pathname) && !isStaticAsset(pathname)
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
      // Rewriting to /maintenance is meaningless to an API client, and simply exempting the
      // whole '/api' prefix (as this used to) left checkout/orders/wishlist/reviews fully
      // reachable for non-staff visitors while every storefront page claimed the site wasn't
      // launched yet -- a real order could still be placed, with inventory reserved and a
      // confirmation email sent, during the exact window maintenance mode exists to prevent.
      // Reads stay open (nothing to block there); only state-changing requests to endpoints
      // outside admin/auth/internal-cron/payment-webhook traffic are blocked outright.
      if (pathname.startsWith('/api/')) {
        if (isBlockedDuringMaintenance(pathname, request.method)) {
          return applySecurityHeaders(NextResponse.json({ error: 'The store is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }))
        }
      } else {
        // The maintenance page (app/maintenance/route.ts) answers 503 + Retry-After itself.
        const rewrite = NextResponse.rewrite(new URL('/maintenance', request.url), { request: { headers: withNonce(new Headers(request.headers)) } })
        rewrite.headers.set('Content-Security-Policy', csp)
        return applySecurityHeaders(rewrite)
      }
    }
  }

  const hasSession = request.cookies.has('session')
  const isApi = pathname.startsWith('/api/')
  const isApiMutation = isApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  if (isApiMutation && hasSession && !isSameOrigin(request)) {
    return applySecurityHeaders(NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }))
  }

  const response = applySecurityHeaders(NextResponse.next({ request: { headers: withNonce(new Headers(request.headers)) } }), { framedBySameSite: isThemePreview, camera: CAMERA_PATHS.has(pathname) })
  response.headers.set('Content-Security-Policy', csp)

  if (isApi && hasSession) {
    response.headers.set('Cache-Control', 'private, no-store')
  }

  return response
}

export const config = {
  matcher: '/:path*',
}
