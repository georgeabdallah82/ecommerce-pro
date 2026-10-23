import { routeError } from '@/lib/api-error'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { saveVideoBytes } from '@/lib/media-storage'
import { MAX_VIDEO_BYTES, sniffVideoType } from '@/lib/product-video'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Admin > Products > a product > Product video: stores a short MP4 or WebM clip (up to 25 MB). The
// file is checked by what it really is, not by its name; the product page plays it.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('media.manage')
    // Refuse a huge body before reading it (a little room for the form around the video).
    if (Number(req.headers.get('content-length') || 0) > MAX_VIDEO_BYTES + 64 * 1024) return json({ error: 'That video is larger than 25 MB. Please choose a shorter or smaller one.' }, { status: 413, headers: NO_STORE })
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'Choose a video file.' }, { status: 400, headers: NO_STORE })
    if (file.size > MAX_VIDEO_BYTES) return json({ error: 'That video is larger than 25 MB. Please choose a shorter or smaller one.' }, { status: 413, headers: NO_STORE })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = bytes.byteLength ? sniffVideoType(bytes) : null
    if (!type) return json({ error: 'That is not a video the store can play. Use an MP4 or WebM file.' }, { status: 400, headers: NO_STORE })
    const saved = await saveVideoBytes(bytes, type)
    await audit(actor.id, 'media.video_uploaded', 'Product', saved.key, { size: saved.sizeBytes, type })
    return json({ ok: true, url: saved.url }, { status: 201, headers: NO_STORE })
  } catch (e) {
    return routeError(e, 'Unable to upload the video', 400)
  }
}
