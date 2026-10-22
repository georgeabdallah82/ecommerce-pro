import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { db } from '@/lib/prisma'
import { isPublicHttpUrl } from '@/lib/product-import'
import { reviewPhotoKey } from '@/lib/review-photos'

// Cloudflare Workers has no writable local filesystem, so uploaded files go to R2 (bound as
// MEDIA_BUCKET in wrangler.jsonc) whenever that binding is available, and are served back via
// /api/media/[key]. Outside Workers (plain `next dev`, no R2 binding) this falls back to writing
// into public/uploads, since a real filesystem is available there.
export async function getMediaBucket(): Promise<any | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as any).MEDIA_BUCKET || null
  } catch {
    return null
  }
}

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024

// Stores an image and lists it in Files. Returns the new asset (its `url` is what pages use).
export async function saveMediaBytes(bytes: Uint8Array, contentType: string, name: string, alt?: string | null) {
  if (!contentType.startsWith('image/')) throw new Error('Only image files are allowed')
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('Maximum file size is 5 MB')
  const fromName = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const fromType = (contentType.split('/')[1] || '').toLowerCase().replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')
  const ext = (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'].includes(fromName) ? fromName : fromType) || 'jpg'
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const bucket = await getMediaBucket()
  let url: string
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } })
    url = `/api/media/${key}`
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('File uploads are not configured for this deployment. Create and bind an R2 bucket — see PRODUCTION-OPS.md.')
  } else {
    const dir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, key), bytes)
    url = `/uploads/${key}`
  }
  return db.mediaAsset.create({ data: { url, name, alt: alt || name, mimeType: contentType, sizeBytes: bytes.byteLength } })
}

// Copies an image from another website into the store's own storage, so a product's photos
// don't disappear (or break) when the supplier changes their page.
export async function saveMediaFromUrl(url: string, name: string, alt?: string | null) {
  if (!isPublicHttpUrl(url)) throw new Error('Not a public image address')
  const res = await fetch(url, { headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
  if (!res.ok) throw new Error(`Image download failed (${res.status})`)
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!type.startsWith('image/') || type === 'image/svg+xml') throw new Error('Not a photo')
  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > MAX_MEDIA_BYTES) throw new Error('Photo is larger than 5 MB')
  const bytes = new Uint8Array(await res.arrayBuffer())
  return saveMediaBytes(bytes, type, name, alt)
}

// A customer's review photo (app/api/reviews/photo): stored like other uploads but not listed in
// Files, since it belongs to the review. The caller has already checked the type and size.
export async function saveReviewPhoto(bytes: Uint8Array, contentType: 'image/jpeg' | 'image/png' | 'image/webp') {
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const key = `review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const bucket = await getMediaBucket()
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } })
    return `/api/media/${key}`
  }
  if (process.env.NODE_ENV === 'production') throw new Error('File uploads are not configured for this deployment.')
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, key), bytes)
  return `/uploads/${key}`
}

// Removes a review photo the owner took off a review (Admin > Reviews).
export async function deleteReviewPhoto(url: string) {
  const key = reviewPhotoKey(url)
  if (!key) return
  const bucket = await getMediaBucket()
  if (bucket) { await bucket.delete(key); return }
  if (process.env.NODE_ENV !== 'production') await unlink(path.join(process.cwd(), 'public', 'uploads', key)).catch(() => {})
}
