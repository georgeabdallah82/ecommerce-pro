// Which admin module belongs to which app, and how requests reach the right host.
//
//   erp   -> erp.yallahaul.com   (ERP: products, stock, purchasing, orders, customers, reports, staff)
//   pos   -> pos.yallahaul.com   (point of sale: till, shifts, receipts)
//   store -> the storefront host (online store, content, marketing and other storefront tools)
//
// The hosts come from ERP_HOST, POS_HOST and STORE_HOST. While ERP_HOST and POS_HOST are both
// unset, nothing here changes behaviour: every admin page stays on the one host, as before.
// Pure functions only, so the proxy, the admin navigation and the tests share one rule.

export type AdminApp = 'erp' | 'pos' | 'store'

export type AdminHosts = { erp?: string; pos?: string; store?: string }

// Longest prefix wins. A prefix matches whole path segments only: /admin/customers does not
// match /admin/customer-segments.
const APP_PREFIXES: Array<[string, AdminApp]> = [
  ['/admin/pos', 'pos'],

  ['/admin/online-store', 'store'],
  ['/admin/content', 'store'],
  ['/admin/media', 'store'],
  ['/admin/metafields', 'store'],
  ['/admin/coupons', 'store'],
  ['/admin/bundles', 'store'],
  ['/admin/marketing', 'store'],
  ['/admin/newsletter', 'store'],
  ['/admin/push-campaigns', 'store'],
  ['/admin/live-visitors', 'store'],
  ['/admin/reviews', 'store'],
  ['/admin/questions', 'store'],

  ['/admin/notices', 'erp'],
  ['/admin/orders', 'erp'],
  ['/admin/sales', 'erp'],
  ['/admin/returns', 'erp'],
  ['/admin/draft-orders', 'erp'],
  ['/admin/order-edits', 'erp'],
  ['/admin/products', 'erp'],
  ['/admin/collections', 'erp'],
  ['/admin/inventory', 'erp'],
  ['/admin/operations', 'erp'],
  ['/admin/purchase-orders', 'erp'],
  ['/admin/customers', 'erp'],
  ['/admin/customer-segments', 'erp'],
  ['/admin/gift-cards', 'erp'],
  ['/admin/reports', 'erp'],
  ['/admin/shipping', 'erp'],
  ['/admin/tax', 'erp'],
  ['/admin/data-transfer', 'erp'],
  ['/admin/users', 'erp'],
  ['/admin/activity', 'erp'],
  ['/admin/settings', 'erp'],
  ['/admin/system', 'erp'],
  ['/admin/launch', 'erp'],
  ['/admin/website-status', 'erp'],
]

/**
 * The app that owns an admin path, or null when the path is shared by every app (login,
 * sign-in and two-step pages, anything not listed). The admin home (/admin) is the ERP dashboard.
 */
export function adminAppForPath(pathname: string): AdminApp | null {
  if (pathname === '/admin') return 'erp'
  let best: { prefix: string; app: AdminApp } | null = null
  for (const [prefix, app] of APP_PREFIXES) {
    const matches = pathname === prefix || pathname.startsWith(`${prefix}/`)
    if (matches && (!best || prefix.length > best.prefix.length)) best = { prefix, app }
  }
  return best?.app ?? null
}

/** Where each app's home page is. The POS has no list page yet; its home is the till. */
export function appHomePath(app: AdminApp): string {
  return app === 'pos' ? '/admin/pos' : '/admin'
}

export function adminHostsFromEnv(env: Record<string, string | undefined>): AdminHosts {
  const clean = (value: string | undefined) => {
    const host = value?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return host || undefined
  }
  return { erp: clean(env.ERP_HOST), pos: clean(env.POS_HOST), store: clean(env.STORE_HOST) }
}

/** True once either app host is configured. Until then the admin stays on one host, as before. */
export function appHostsConfigured(hosts: AdminHosts): boolean {
  return Boolean(hosts.erp || hosts.pos)
}

/** Which app a request's host belongs to (the port is ignored). Anything unknown is the store. */
export function appForHostname(hostHeader: string | null | undefined, hosts: AdminHosts): AdminApp {
  const host = (hostHeader ?? '').trim().toLowerCase().split(':')[0]
  if (hosts.erp && host === hosts.erp) return 'erp'
  if (hosts.pos && host === hosts.pos) return 'pos'
  return 'store'
}

/** Whether a module (a sidebar link or a path) should be listed on the host the admin is on. */
export function moduleVisibleOn(pathname: string, here: AdminApp, hosts: AdminHosts): boolean {
  if (!appHostsConfigured(hosts)) return true
  const owner = adminAppForPath(pathname)
  return owner === null || owner === here
}

function hostFor(app: AdminApp, hosts: AdminHosts): string | undefined {
  return app === 'erp' ? hosts.erp : app === 'pos' ? hosts.pos : hosts.store
}

function isAssetOrInternal(pathname: string) {
  return pathname.startsWith('/api/') || pathname.startsWith('/_next/') || /\.[a-zA-Z0-9]+$/.test(pathname)
}

// Local development and the CI browser test run on localhost. They have no staff hosts, so the
// split never applies there: every page stays where it was asked for.
export function isLocalHostname(hostHeader: string | null | undefined) {
  const host = (hostHeader ?? '').trim().toLowerCase().split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]' || host.endsWith('.localhost')
}

/**
 * The URL to send a request to when it reached the wrong host for the module it asks for,
 * or null when it can stay. Storefront pages on the ERP or POS host go to that app's home,
 * so staff hosts never show the shop.
 */
export function adminHostRedirect(input: {
  hostHeader: string | null | undefined
  pathname: string
  search: string
  protocol: string
  hosts: AdminHosts
}): string | null {
  const { hostHeader, pathname, search, protocol, hosts } = input
  if (!appHostsConfigured(hosts) || isLocalHostname(hostHeader)) return null

  const here = appForHostname(hostHeader, hosts)
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/')

  if (here !== 'store' && !isAdminPath && !isAssetOrInternal(pathname)) {
    const home = appHomePath(here)
    return `${protocol}//${hostFor(here, hosts)}${home}`
  }
  if (!isAdminPath) return null

  const owner = adminAppForPath(pathname)
  if (owner === null || owner === here) return null

  const targetHost = hostFor(owner, hosts)
  if (!targetHost) return null
  return `${protocol}//${targetHost}${pathname}${search}`
}
