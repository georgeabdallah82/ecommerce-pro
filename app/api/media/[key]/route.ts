import { getCloudflareContext } from '@opennextjs/cloudflare'
import { parseByteRange } from '@/lib/http-range'

// Public read endpoint for admin-uploaded media stored in R2 (see app/api/admin/media/upload).
// R2 objects have no public URL of their own on this deployment (no custom domain configured
// on the bucket), so uploaded assets are served back through the app instead.
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  // Payment screenshots share the bucket but are private: only staff read them, through the admin route.
  if (key.startsWith('proof-')) return new Response('Not found', { status: 404 })
  try {
    const { env } = await getCloudflareContext({ async: true })
    const bucket = (env as any).MEDIA_BUCKET
    if (!bucket) return new Response('Not found', { status: 404 })

    // Videos are asked for a piece at a time (Range); iPhones will not play one otherwise.
    const wanted = req.headers.get('range')
    let object: any
    let status = 200
    const extra = new Headers()
    if (wanted) {
      const head = await bucket.head(key)
      if (!head) return new Response('Not found', { status: 404 })
      const range = parseByteRange(wanted, head.size)
      if (range === 'invalid') return new Response('Range not satisfiable', { status: 416, headers: { 'content-range': `bytes */${head.size}` } })
      if (range) {
        object = await bucket.get(key, { range: { offset: range.start, length: range.end - range.start + 1 } })
        status = 206
        extra.set('content-range', `bytes ${range.start}-${range.end}/${head.size}`)
        extra.set('content-length', String(range.end - range.start + 1))
      }
    }
    if (!object) object = await bucket.get(key)
    if (!object) return new Response('Not found', { status: 404 })
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    extra.forEach((value, name) => headers.set(name, value))
    headers.set('etag', object.httpEtag)
    headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    // Uploads are served from the store's own origin. An SVG can carry <script>; opened
    // directly it would run as the store (and as whoever is signed in). These headers make
    // the browser treat the file as an inert document; <img> rendering is unaffected.
    headers.set('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox")
    headers.set('x-content-type-options', 'nosniff')
    return new Response(object.body, { status, headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
