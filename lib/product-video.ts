// Product videos: a short clip on the product page, uploaded in the product editor. The rules that
// need no database, shared by the upload route, the product routes, the page and the tests.

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024

export type VideoType = 'mp4' | 'webm'
export const VIDEO_CONTENT_TYPES: Record<VideoType, string> = { mp4: 'video/mp4', webm: 'video/webm' }

// Photo formats that share the MP4 family's header ("ftyp"): a HEIC photo renamed .mp4 is not a video.
const IMAGE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis'])

// What the file really is, from its first bytes. The name and the type the browser reports are never
// trusted, so a page or a script renamed .mp4 is refused.
export function sniffVideoType(bytes: Uint8Array): VideoType | null {
  const b = bytes
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase()
    return IMAGE_BRANDS.has(brand) ? null : 'mp4'
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm'
  return null
}

export const VIDEO_KEY_PREFIX = 'video-'
export const isVideoKey = (key: unknown): key is string => typeof key === 'string' && /^video-[a-f0-9]{32}\.(mp4|webm)$/.test(key)

// The only addresses a product's video may have: the store's own uploaded files. Anything else
// (another website, a script address, a picture) is dropped, so a product can never point at a
// stranger's page or inject markup into the product page.
export function cleanVideoUrl(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  const match = /^\/(?:api\/media|uploads)\/(video-[a-f0-9]{32}\.(?:mp4|webm))$/.exec(value)
  return match && isVideoKey(match[1]) ? value : null
}
