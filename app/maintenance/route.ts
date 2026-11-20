import { MAINTENANCE_MODE_INFO } from '@/lib/maintenance-defaults'
import { renderMaintenancePage } from '@/lib/maintenance-page'
import { maintenancePageData } from '@/lib/maintenance-page-data'
import { MAINTENANCE_GATE_HEADER } from '@/lib/edge-config'
import { whatsappUrl } from '@/lib/links'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

// The page customers see while maintenance mode is on (proxy.ts sends every storefront page
// here). 503 + Retry-After tells search engines the store is closed only for now, so its pages
// keep their place in search. While maintenance mode is off, /maintenance sends visitors to the
// store, except /maintenance?preview=1 (the "Preview" link in Settings). What it shows comes from a
// copy kept in the media bucket (lib/maintenance-page-data.ts), so a visitor does not wake the database.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const preview = url.searchParams.has('preview')
  // Sent here by proxy.ts: the store is closed for this request, whatever this page's own copy says (see proxy.ts).
  const viaGate = request.headers.get(MAINTENANCE_GATE_HEADER) === '1'
  const { data, source } = await maintenancePageData()
  const maintenance = data.maintenance
  if (maintenance && !maintenance.enabled && !preview && !viaGate) return Response.redirect(new URL('/', url), 307)
  const html = renderMaintenancePage({
    brand: String(data.brand || config.brand),
    mode: maintenance?.mode,
    logoUrl: data.logoUrl || undefined,
    color: data.color || undefined,
    headline: maintenance?.headline || MAINTENANCE_MODE_INFO.maintenance.headline,
    message: maintenance?.message || MAINTENANCE_MODE_INFO.maintenance.message,
    backBy: maintenance?.backBy,
    whatsappUrl: data.phone ? whatsappUrl(data.phone, data.country || undefined) : '',
    email: data.email || undefined,
    preview: !viaGate && !!maintenance && !maintenance.enabled,
  })
  const closed = viaGate || !maintenance || maintenance.enabled
  return new Response(html, {
    status: closed ? 503 : 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      // Where the page's details came from: "copy" (no database) or "database".
      'x-page-data': source,
      ...(closed ? { 'retry-after': '3600' } : {}),
    },
  })
}
