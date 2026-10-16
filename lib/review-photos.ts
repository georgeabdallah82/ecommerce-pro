// Photos on reviews (app/review/[orderNumber]): up to 3 per product, made smaller on the phone
// before upload (components/review-photo-picker.tsx), checked again here, and stored with the
// other uploads in R2 (lib/media-storage.ts saveReviewPhoto). They show with the review once the
// owner approves it, and the owner can remove any photo in Admin > Reviews.

export const MAX_REVIEW_PHOTOS = 3
export const MAX_REVIEW_PHOTO_BYTES = 3 * 1024 * 1024

// What the file really is, from its first bytes -- not from its name or what the browser says.
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  return null
}

// Only addresses this store made for review photos are accepted with a review.
export function isReviewPhotoUrl(url: unknown): url is string {
  return typeof url === 'string' && /^\/(?:api\/media|uploads)\/review-[a-z0-9-]{6,60}\.(?:jpg|png|webp)$/.test(url)
}

export function parseReviewPhotos(raw: unknown): { photos: string[]; error?: string } {
  if (raw === undefined || raw === null) return { photos: [] }
  if (!Array.isArray(raw)) return { photos: [], error: 'Invalid review' }
  if (raw.length > MAX_REVIEW_PHOTOS) return { photos: [], error: 'Up to 3 photos per product.' }
  const photos: string[] = []
  for (const url of raw) {
    if (!isReviewPhotoUrl(url)) return { photos: [], error: 'Invalid review' }
    if (!photos.includes(url)) photos.push(url)
  }
  return { photos }
}

// The R2 key of a review photo address ("/api/media/review-...jpg" -> "review-...jpg").
export const reviewPhotoKey = (url: string) => isReviewPhotoUrl(url) ? url.split('/').pop()! : ''
