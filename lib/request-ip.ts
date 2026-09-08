type HeaderReader = { get(name: string): string | null }

// Cloudflare Workers (the production runtime) sets cf-connecting-ip on every
// request; it does not set x-real-ip. x-forwarded-for and x-real-ip are kept
// as fallbacks for local dev and any other reverse proxy in front of the app.
export function clientIp(headers: HeaderReader) {
  return (
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}
