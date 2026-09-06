import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { getMediaBucket, storeMediaToR2 } from '@/lib/r2-media'
import { storeMediaLocally } from '@/lib/local-media'
import { json } from '@/lib/utils'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('media.manage')
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) return json({ error: 'File required' }, { status: 400 })
    if (!file.type.startsWith('image/')) return json({ error: 'Only image files are allowed' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return json({ error: 'Maximum file size is 5 MB' }, { status: 400 })

    const stored = getMediaBucket()
      ? await storeMediaToR2(file)
      : await storeMediaLocally(file)

    const asset = await db.mediaAsset.create({
      data: {
        url: stored.url,
        name: file.name,
        alt: String(form.get('alt') || file.name),
        mimeType: file.type,
        sizeBytes: file.size,
      },
    })

    await audit(actor.id, 'media.uploaded', 'MediaAsset', asset.id, {
      name: file.name,
      size: file.size,
      key: stored.key,
    })

    return json({ asset }, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to upload image' }, { status: 400 })
  }
}
