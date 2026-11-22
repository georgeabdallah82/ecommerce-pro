// Which addresses stay open while the store is in maintenance mode (proxy.ts).
// '/api' is deliberately NOT in this list (see isBlockedDuringMaintenance below) -- API requests get
// their own, narrower bypass so mutations to non-admin/auth/internal/webhook endpoints are
// actually blocked during maintenance instead of silently exempted wholesale.
// /unsubscribe, /api/refill/stop: stopping reminder emails must keep working while the store is closed.
// /driver: a driver's private delivery list (lib/drivers.ts) -- orders taken on WhatsApp still go
// out while the store is closed.
const MAINTENANCE_BYPASS_PREFIXES = ['/admin', '/maintenance', '/_next', '/unsubscribe', '/driver/']
const MAINTENANCE_API_BYPASS_PREFIXES = ['/api/admin', '/api/auth', '/api/internal', '/api/payments', '/api/health', '/api/newsletter', '/api/unsubscribe', '/api/refill/stop', '/api/driver/']
const MAINTENANCE_BYPASS_EXACT = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml'])

// Paths the maintenance check never applies to (staff areas, the maintenance page itself...).
export function skipsMaintenanceCheck(pathname: string) {
  return MAINTENANCE_BYPASS_PREFIXES.some(p => pathname.startsWith(p)) || MAINTENANCE_BYPASS_EXACT.has(pathname)
}

// During maintenance, API reads stay open; changes are refused except for the endpoints above.
export function isBlockedDuringMaintenance(pathname: string, method: string) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !MAINTENANCE_API_BYPASS_PREFIXES.some(p => pathname.startsWith(p))
}
