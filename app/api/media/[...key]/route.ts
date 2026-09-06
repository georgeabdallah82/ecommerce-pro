import { getMedia } from '@/lib/r2-media'

export const runtime = 'edge'

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const objectKey = key.join('/')
  if (!objectKey.startsWith('uploads/')) return new Response('Not found', { status: 404 })

  const media = await getMedia(objectKey)
  if (!media) return new Response('Not found', { status: 404 })

  return new Response(media.body, {
    headers: {
      'Content-Type': media.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...(media.contentLength ? { 'Content-Length': String(media.contentLength) } : {}),
      ...(media.etag ? { ETag: media.etag } : {}),
    },
  })
}
