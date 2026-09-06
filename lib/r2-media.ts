import { getCloudflareContext } from '@opennextjs/cloudflare'
import { mkdir, writeFile, readFile } from 'fs/promises'
import path from 'path'

type R2Object = {
  body: ReadableStream<Uint8Array>
  size: number
  httpEtag: string
  httpMetadata?: { contentType?: string }
}

type R2Like = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: Record<string, string | number> }): Promise<unknown>
  get(key: string): Promise<R2Object | null>
}

function safeFilename(name: string) {
  const ext = (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

function getBucket(): R2Like | null {
  try {
    const { env } = getCloudflareContext()
    const bucket = (env as unknown as Record<string, unknown>).MEDIA_BUCKET
    return bucket && typeof bucket === 'object' && typeof (bucket as R2Like).put === 'function'
      ? (bucket as R2Like)
      : null
  } catch {
    return null
  }
}

export async function storeMedia(file: File) {
  const filename = safeFilename(file.name)
  const key = `uploads/${filename}`
  const body = await file.arrayBuffer()
  const bucket = getBucket()

  if (bucket) {
    await bucket.put(key, body, {
      httpMetadata: {
        contentType: file.type,
        contentLength: file.size,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
    return { key, url: `/api/media/${key}` }
  }

  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), Buffer.from(body))
  return { key, url: `/uploads/${filename}` }
}

export async function getMedia(key: string) {
  const bucket = getBucket()

  if (bucket) {
    const object = await bucket.get(key)
    if (!object) return null
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType || 'application/octet-stream',
      contentLength: object.size,
      etag: object.httpEtag,
    }
  }

  const filename = path.basename(key)
  if (!filename || filename !== key.replace(/^uploads\//, '')) return null

  try {
    const filePath = path.join(process.cwd(), 'public', 'uploads', filename)
    const body = await readFile(filePath)
    return {
      body: new Blob([body]).stream(),
      contentType: 'application/octet-stream',
      contentLength: body.byteLength,
      etag: undefined,
    }
  } catch {
    return null
  }
}
