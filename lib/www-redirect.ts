// The store's domain is connected to the Worker both with and without "www." (people type
// both). Visitors on www are sent to the same page on the plain domain, so sign-ins, carts and
// search results all live on one address. Returns null when there is nothing to redirect.
export function wwwRedirectTarget(requestUrl: string, hostHeader?: string | null): string | null {
  const url = new URL(requestUrl)
  const host = (hostHeader || url.host).trim().toLowerCase()
  if (!host.startsWith('www.') || host.length <= 4) return null
  url.protocol = 'https:'
  url.host = host.slice(4)
  url.port = ''
  return url.toString()
}

// Addresses only this computer or a private network can reach: development (next dev, wrangler
// dev) runs on plain http there and must not be sent to an https address that doesn't exist.
function isLocalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (!host.includes('.') || host.includes(':')) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true
  return /(^|\.)(localhost|local|internal|test)$/.test(host)
}

// A first visit typed as "yallahaul.com" reaches the Worker over plain http; the browser only
// learns to use https from the Strict-Transport-Security header once it has been there over
// https. Send http visitors to the same page on https. Cloudflare says how the visitor arrived
// in CF-Visitor and X-Forwarded-Proto; if anything says https, the request is left alone, so a
// secure visit can never be redirected in a loop.
export function httpsRedirectTarget(requestUrl: string, headers: { host?: string | null, cfVisitor?: string | null, forwardedProto?: string | null } = {}): string | null {
  const url = new URL(requestUrl)
  const host = (headers.host || url.host).trim().toLowerCase()
  const hostname = host.replace(/:\d+$/, '')
  if (!hostname || isLocalHost(hostname)) return null
  let visitorScheme = ''
  try { visitorScheme = String(JSON.parse(headers.cfVisitor || '{}')?.scheme || '').toLowerCase() } catch { visitorScheme = '' }
  const forwarded = String(headers.forwardedProto || '').split(',')[0].trim().toLowerCase()
  const schemes = [visitorScheme, forwarded, url.protocol.replace(':', '').toLowerCase()].filter(Boolean)
  if (schemes.includes('https') || !schemes.includes('http')) return null
  url.protocol = 'https:'
  url.host = hostname.startsWith('www.') && hostname.length > 4 ? hostname.slice(4) : hostname
  url.port = ''
  return url.toString()
}
