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
