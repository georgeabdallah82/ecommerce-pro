// Shrinks photos in the browser before they're uploaded, so the storefront never serves a
// multi-megabyte original where a card shows a 300px thumbnail. Cloudflare Workers have no
// image library, so this is the one place resizing can happen. Runs client-side only.

export const MAX_IMAGE_EDGE = 1600
const QUALITY = 0.82
const RESIZABLE = ['image/jpeg', 'image/png', 'image/webp']

// Target size keeping the aspect ratio, never upscaling.
export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, QUALITY))
}

export async function optimizeImage(file: File): Promise<File> {
  // SVG, GIF (may be animated) and anything unusual go up untouched.
  if (typeof document === 'undefined' || !RESIZABLE.includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    // WebP keeps transparency and is much smaller; fall back to JPEG for opaque images
    // on the rare browser that can't encode WebP.
    let blob = await encode(canvas, 'image/webp')
    if (!blob || blob.type !== 'image/webp') blob = file.type === 'image/png' ? null : await encode(canvas, 'image/jpeg')
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.jpg')
    return new File([blob], name, { type: blob.type, lastModified: Date.now() })
  } catch {
    return file
  }
}
