// The store's own visitor counter (Admin > Dashboard "Visitors now / today", Admin > Live
// visitors): components/live-visitor-tracker.tsx reports a shopper's page every HEARTBEAT_MS to
// app/api/analytics/visitor/route.ts, which keeps one row per browser (LiveVisitorSession).
//
// Who is counted: shoppers on the store's pages. Not counted: the admin and the theme editor's
// preview, and anyone signed in as staff (the owner looking at their own store is not a visitor).
// Shared by the browser part and the server part so both apply the same rules.

// "Visitors now" = seen in the last LIVE_WINDOW_MS (the dashboard and the Live visitors page).
export const LIVE_WINDOW_MS = 90_000
// How often an open page reports. Two missed reports still keep a shopper inside the live window.
export const HEARTBEAT_MS = 30_000
// A page nobody has touched for this long stops reporting until the shopper scrolls, taps or
// comes back to the tab: an open, forgotten tab would otherwise keep the database awake all day.
export const IDLE_STOP_MS = 10 * 60_000
// After the server says "staff", this browser stops reporting for this long (a staff phone or
// tablet that later browses signed out is counted again after that).
export const STAFF_PAUSE_MS = 12 * 60 * 60_000
export const STAFF_PAUSE_KEY = 'live_visitor_staff_until'

export function isTrackedPath(pathname: string) {
  const path = pathname || '/'
  return !path.startsWith('/admin') && !path.startsWith('/api/') && !path.startsWith('/theme-editor-preview') && !path.startsWith('/driver/') && path !== '/maintenance'
}

// Signed-in staff (any role but CUSTOMER) are never counted as visitors.
export function isStaffUser(user: { role?: string | null } | null | undefined) {
  return !!user?.role && user.role !== 'CUSTOMER'
}

// When a shopper leaves, they drop out of "Visitors now" at once but still count in "today".
export function leftAt(now: Date) {
  return new Date(now.getTime() - LIVE_WINDOW_MS - 1000)
}
