// URL redirects (Admin > Online store > URL redirects): how the two addresses are saved, and which redirects are
// refused. No database here, so the redirects API, the pages and blog APIs (which add one when a published page
// moves) and tests/admin-online-store-pages.test.ts share it.
//
// proxy.ts looks a redirect up by the visitor's exact path, before any page renders, and sends them on with a 308:
// - the old address is a path only: a full address pasted in is cut down to its path, and anything after ? or # is
//   dropped, since it could never match;
// - a redirect from one of the store's own pages would hide that page from everyone, and one from checkout, the cart
//   or an account page would break buying, so both are refused;
// - redirects that lead back to where they started send visitors round in a circle until the browser gives up, so
//   that is refused too.

export type RedirectRule = { id?: string; fromPath: string; toPath: string }

// Everything at or under these keeps the store working (and the admin): never redirected.
export const WORKING_PATHS = ['/admin', '/admin-login', '/api', '/_next', '/maintenance', '/checkout', '/cart', '/account', '/order', '/orders', '/invoice', '/pay-invoice', '/track', '/unsubscribe', '/review', '/driver', '/feeds', '/theme-editor-preview']
// The store's own pages. A redirect from one of these exact addresses would hide it; addresses under them (an old
// collection, post or product) can be redirected.
export const STORE_PAGE_PATHS = ['/shop', '/collections', '/blog', '/product', '/wishlist', '/stores', '/wholesale', '/privacy-policy', '/refund-policy', '/terms-of-service']

const trimSlashes = (path: string) => path.replace(/^\/{2,}/, '/').replace(/\/+$/, '') || '/'

export function cleanFromPath(value: unknown): string {
  let path = String(value ?? '').trim()
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname } catch { /* not a valid address: kept as typed */ }
  }
  path = path.replace(/[?#].*$/, '')
  if (path && !path.startsWith('/')) path = `/${path}`
  return trimSlashes(path).slice(0, 400)
}

export function cleanToPath(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 2000)
  if (!raw) return ''
  return trimSlashes(raw.startsWith('/') ? raw : `/${raw}`).slice(0, 400)
}

// The path a destination lands on (no query or #), which is what the proxy would look up next.
const landing = (to: string) => to.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/'

export function redirectProblem(fromPath: string, toPath: string, others: RedirectRule[], selfId?: string): string | null {
  if (!fromPath || fromPath === '/') return 'A source path other than / is required'
  if (WORKING_PATHS.some(path => fromPath === path || fromPath.startsWith(`${path}/`))) return 'This path is reserved and cannot be redirected: your store needs it for checkout, accounts or orders.'
  if (STORE_PAGE_PATHS.includes(fromPath)) return `${fromPath} is a page of your store. A redirect from it would hide that page from everyone.`
  if (!toPath) return 'A destination path or URL is required'
  if (fromPath === toPath || fromPath === landing(toPath)) return 'The source and destination cannot be the same'
  if (/^https?:\/\//i.test(toPath)) return null
  // Follow the destination through the other redirects: arriving back at the old address is a circle.
  const next = new Map(others.filter(rule => !selfId || rule.id !== selfId).map(rule => [rule.fromPath, rule.toPath]))
  let at = landing(toPath)
  const seen = new Set<string>()
  while (next.has(at) && !seen.has(at) && seen.size < 50) {
    seen.add(at)
    const to = next.get(at) as string
    if (/^https?:\/\//i.test(to)) return null
    at = landing(to)
    if (at === fromPath) return `This would send visitors in a circle: ${landing(toPath)} already leads back to ${fromPath}.`
  }
  return null
}
