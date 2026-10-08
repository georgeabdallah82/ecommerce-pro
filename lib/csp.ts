// Content-Security-Policy built by proxy.ts with a fresh nonce per request. Only scripts carrying
// the nonce run: Next.js adds it to its own scripts (it reads the policy from the request header),
// app/layout.tsx passes it to the admin-theme and tracking-pixel <Script>s, and 'strict-dynamic'
// lets those trusted scripts load what they need (fbevents.js, gtag.js, the TikTok SDK, the card
// gateway's checkout.min.js) without listing hosts the merchant can change in Settings. A script
// injected into a page some other way -- the attack this exists for -- has no nonce and is refused.
// "https: 'unsafe-inline'" are ignored by every browser that understands nonces; they only keep
// very old browsers working. Styles, images, frames and fetches stay open to https: so product
// images, embeds and the pixels' beacons keep working.
export function contentSecurityPolicy(nonce: string, frameAncestors: string, dev = process.env.NODE_ENV !== 'production') {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https:${dev ? ' ws: wss:' : ''}`,
    "media-src 'self' blob: https:",
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self' https://epayment.areeba.com",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}
