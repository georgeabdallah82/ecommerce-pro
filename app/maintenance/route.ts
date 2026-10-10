import { getMaintenanceConfig } from '@/lib/maintenance'
import { renderMaintenancePage } from '@/lib/maintenance-page'
import { getThemeState } from '@/lib/theme'
import { getContactInfo } from '@/lib/store-contact'
import { whatsappUrl } from '@/lib/links'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

// The page customers see while maintenance mode is on (proxy.ts sends every storefront page
// here). 503 + Retry-After tells search engines the store is closed only for now, so its pages
// keep their place in search. While maintenance mode is off, /maintenance sends visitors to the
// store, except /maintenance?preview=1 (the "Preview" link in Settings).
export async function GET(request: Request) {
  const url = new URL(request.url)
  const preview = url.searchParams.has('preview')
  const [maintenance, themeState, contact] = await Promise.all([
    getMaintenanceConfig().catch(() => null),
    getThemeState().catch(() => null),
    getContactInfo().catch(() => null),
  ])
  if (maintenance && !maintenance.enabled && !preview) return Response.redirect(new URL('/', url), 307)
  const theme: any = themeState?.theme || {}
  const html = renderMaintenancePage({
    brand: String(theme.brandName || config.brand),
    logoUrl: theme.logoUrl,
    color: theme.colors?.primary,
    headline: maintenance?.headline || "We'll be right back",
    message: maintenance?.message || 'Please check back soon.',
    backBy: maintenance?.backBy,
    whatsappUrl: contact?.phone ? whatsappUrl(contact.phone, contact.country) : '',
    email: contact?.email,
    preview: !!maintenance && !maintenance.enabled,
  })
  const closed = !maintenance || maintenance.enabled
  return new Response(html, {
    status: closed ? 503 : 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...(closed ? { 'retry-after': '3600' } : {}),
    },
  })
}
