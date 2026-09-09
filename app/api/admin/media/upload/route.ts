import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// Cloudflare Workers has no writable local filesystem, so uploaded files go to R2 (bound as
// MEDIA_BUCKET in wrangler.jsonc) whenever that binding is available, and are served back via
// /api/media/[key]. Outside Workers (plain `next dev`, no R2 binding) this falls back to writing
// into public/uploads like before, since a real filesystem is available there -- mirroring the
// resilient-fallback-in-dev/hard-fail-in-production pattern already used for the database client.
async function getMediaBucket(): Promise<any | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return (env as any).MEDIA_BUCKET || null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('media.manage')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'File required' }, { status: 400 })
    if (!file.type.startsWith('image/')) return json({ error: 'Only image files are allowed' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return json({ error: 'Maximum file size is 5 MB' }, { status: 400 })

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())

    const bucket = await getMediaBucket()
    let url: string
    if (bucket) {
      await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } })
      url = `/api/media/${key}`
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('File uploads are not configured for this deployment. Create and bind an R2 bucket — see PRODUCTION-OPS.md.')
    } else {
      const dir = path.join(process.cwd(), 'public', 'uploads')
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, key), bytes)
      url = `/uploads/${key}`
    }

    const asset = await db.mediaAsset.create({ data: { url, name: file.name, alt: String(form.get('alt') || file.name), mimeType: file.type, sizeBytes: file.size } })
    await audit(actor.id, 'media.uploaded', 'MediaAsset', asset.id, { name: file.name, size: file.size })
    return json({ asset }, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to upload image' }, { status: 400 })
  }
}
