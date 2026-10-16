// Security headers proxy.ts puts on every response it returns: pages, API answers, the
// maintenance page and the admin sign-in page alike. They used to be set both here and in
// next.config.ts, so most responses carried each one twice ("nosniff, nosniff"), while the
// maintenance and sign-in pages missed Strict-Transport-Security and X-Frame-Options.
// camera: the one admin page that scans barcodes with the phone camera (app/admin/inventory/count);
// every other page keeps the camera blocked.
export const CAMERA_PATHS = new Set(['/admin/inventory/count'])

export function securityHeaders(options: { framedBySameSite?: boolean, production?: boolean, camera?: boolean } = {}): [string, string][] {
  const production = options.production ?? process.env.NODE_ENV === 'production'
  return [
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', options.framedBySameSite ? 'SAMEORIGIN' : 'DENY'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    // geolocation=(self): the storefront's opt-in live-map location prompt (components/live-visitor-tracker.tsx)
    // needs it on our own pages; geolocation=() blocked it outright, so "Allow" could never work.
    ['Permissions-Policy', `camera=${options.camera ? '(self)' : '()'}, microphone=(), geolocation=(self)`],
    ['X-DNS-Prefetch-Control', 'on'],
    ...(production ? [['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'] as [string, string]] : []),
  ]
}

export function applySecurityHeaders<T extends { headers: Headers }>(response: T, options: { framedBySameSite?: boolean, production?: boolean, camera?: boolean } = {}): T {
  for (const [name, value] of securityHeaders(options)) response.headers.set(name, value)
  return response
}
