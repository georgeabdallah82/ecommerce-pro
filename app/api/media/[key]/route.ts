import { getCloudflareContext } from '@opennextjs/cloudflare'

// Public read endpoint for admin-uploaded media stored in R2 (see app/api/admin/media/upload).
// R2 objects have no public URL of their own on this deployment (no custom domain configured
// on the bucket), so uploaded assets are served back through the app instead.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  try {
    const { env } = await getCloudflareContext({ async: true })
    const bucket = (env as any).MEDIA_BUCKET
    if (!bucket) return new Response('Not found', { status: 404 })
    const object = await bucket.get(key)
    if (!object) return new Response('Not found', { status: 404 })
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    return new Response(object.body, { headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
