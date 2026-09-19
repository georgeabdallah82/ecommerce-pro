// Top-level app/ route segments. A custom Page or Blog handle matching one of
// these would be permanently unreachable (Next.js always resolves a static
// route over a dynamic [handle] segment at the same level) -- reject it at
// creation time with a clear error instead of letting a merchant publish a
// page they can never actually visit.
export const RESERVED_HANDLES = new Set([
  'account', 'admin', 'admin-login', 'api', 'app', 'blog', 'cart', 'checkout',
  'collections', 'coming-soon', 'invoice', 'order', 'orders', 'pay-invoice', 'privacy-policy',
  'product', 'refund-policy', 'shop', 'terms-of-service', 'track', 'wishlist',
])
