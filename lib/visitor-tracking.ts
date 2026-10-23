// The store's own visitor analytics (Admin > Live visitors and the dashboard's "Visitors now"):
// components/visitor-tracker.tsx reports a shopper's page views and a heartbeat to
// app/api/analytics/visit/route.ts, which keeps one row per visit (VisitorSession) and one per page
// viewed (VisitorPageView). Server code: lib/visitors.ts.
//
// Who is counted: shoppers on the store's pages. Not counted: the admin and the theme editor's
// preview, anyone signed in as staff (the owner looking at their own store is not a visitor), and
// robots. Shared by the browser part and the server part so both apply the same rules.
//
// Privacy: no IP address and no GPS are stored. Only the page, where the visitor came from, the
// approximate place Cloudflare reports (country and city) and the kind of device.

// "Online now" = seen in the last LIVE_WINDOW_MS. A page reports every HEARTBEAT_MS while it is on
// screen, so two missed reports still keep a shopper online.
export const HEARTBEAT_MS = 45_000
export const LIVE_WINDOW_MS = 120_000
// A page nobody has touched for this long stops reporting until the shopper scrolls, taps or comes
// back to the tab: a forgotten open tab would otherwise keep the database awake all day.
export const IDLE_STOP_MS = 5 * 60_000
// A visit ends after this long without activity (the visit cookie's lifetime, renewed on every report).
export const SESSION_TTL_SECONDS = 30 * 60
// Remembers that this browser visited before ("returning" in the report): a random flag, no id.
export const RETURNING_TTL_SECONDS = 90 * 24 * 60 * 60
export const SESSION_COOKIE = 'yh_sid'
export const RETURNING_COOKIE = 'yh_rv'
// After the server says "staff", this browser stops reporting for this long (a staff phone or
// tablet that later browses signed out is counted again after that).
export const STAFF_PAUSE_MS = 12 * 60 * 60_000
export const STAFF_PAUSE_KEY = 'yh_staff_until'
// Kept this long, then deleted (daily job).
export const SESSION_RETENTION_DAYS = 90
export const PAGEVIEW_RETENTION_DAYS = 30
export const MAX_PATH = 300

export function isTrackedPath(pathname: string) {
  const path = pathname || '/'
  return !path.startsWith('/admin') && !path.startsWith('/api/') && !path.startsWith('/theme-editor-preview') && !path.startsWith('/driver/') && path !== '/maintenance'
}

// Signed-in staff (any role but CUSTOMER) are never counted as visitors.
export function isStaffUser(user: { role?: string | null } | null | undefined) {
  return !!user?.role && user.role !== 'CUSTOMER'
}

// ---- The steps of a visit -------------------------------------------------------------------

export type Stage = 'browsing' | 'product' | 'cart' | 'checkout' | 'ordered'
export const STAGES: Stage[] = ['browsing', 'product', 'cart', 'checkout', 'ordered']
export const STAGE_LABELS: Record<Stage, string> = {
  browsing: 'Browsing',
  product: 'Viewing a product',
  cart: 'In the cart',
  checkout: 'Checking out',
  ordered: 'Ordered',
}

const pathOnly = (path: string) => String(path || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/'

// The step a page belongs to.
export function stageOf(path: string): Stage {
  const p = pathOnly(path)
  if (p.startsWith('/order/success')) return 'ordered'
  if (p === '/checkout' || p.startsWith('/checkout/')) return 'checkout'
  if (p === '/cart') return 'cart'
  if (p.startsWith('/product/')) return 'product'
  return 'browsing'
}

export const stageRank = (stage: Stage) => STAGES.indexOf(stage)
export const stageFromRank = (rank: number): Stage => STAGES[Math.min(STAGES.length - 1, Math.max(0, Math.floor(Number(rank) || 0)))]

// What a page is called in the report. Products and collections are named from the database by the
// caller (`slug`); everything else has a fixed name.
export type PathInfo = { kind: 'static' | 'product' | 'collection' | 'other'; label: string; slug?: string }

const STATIC_NAMES: Array<[RegExp, string]> = [
  [/^\/$/, 'Home'],
  [/^\/shop$/, 'Shop'],
  [/^\/collections$/, 'All collections'],
  [/^\/cart$/, 'Cart'],
  [/^\/checkout/, 'Checkout'],
  [/^\/order\/success/, 'Order confirmed'],
  [/^\/search/, 'Search'],
  [/^\/wishlist/, 'Wishlist'],
  [/^\/account/, 'Account'],
  [/^\/track/, 'Track an order'],
  [/^\/blog/, 'Blog'],
  [/^\/contact/, 'Contact'],
  [/^\/about/, 'About'],
]

export function describePath(path: string): PathInfo {
  const p = pathOnly(path)
  const product = /^\/product\/([^/]+)$/.exec(p)
  if (product) return { kind: 'product', label: 'Product', slug: decodeURIComponent(product[1]).slice(0, 120) }
  const collection = /^\/collections\/([^/]+)$/.exec(p)
  if (collection) return { kind: 'collection', label: 'Collection', slug: decodeURIComponent(collection[1]).slice(0, 120) }
  for (const [pattern, label] of STATIC_NAMES) if (pattern.test(p)) return { kind: 'static', label }
  return { kind: 'other', label: p.length > 40 ? `${p.slice(0, 37)}...` : p }
}

// The path as it is stored: no query string or fragment (they can carry personal details such as
// an order view code), no trailing slash, limited length.
export function storedPath(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return pathOnly(value).slice(0, MAX_PATH) || '/'
}
