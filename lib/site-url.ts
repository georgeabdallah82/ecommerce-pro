import { headers } from 'next/headers'

// The shop's public address for links sent to customers: the configured one
// (NEXT_PUBLIC_SITE_URL / APP_URL), else the address this request came in on.
export function configuredSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
}

export async function requestOrigin() {
  const configured = configuredSiteUrl()
  if (configured) return configured
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const proto = h.get('x-forwarded-proto') || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  return host ? `${proto}://${host}` : ''
}
