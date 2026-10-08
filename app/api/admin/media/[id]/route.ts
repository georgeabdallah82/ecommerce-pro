import { routeError } from '@/lib/api-error'
import { unlink } from 'fs/promises'
import path from 'path'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { findMediaUsage, mediaBucketKey } from '@/lib/media-usage'

// Where the file is still used, so the admin can be warned before deleting it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('media.view')
    const { id } = await params
    const asset = await db.mediaAsset.findUnique({ where: { id } })
    if (!asset) return json({ error: 'File not found' }, { status: 404 })
    return json({ usedIn: await findMediaUsage(asset.url) })
  } catch (e) {
    return routeError(e, 'Forbidden', 403)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('media.manage')
    const { id } = await params
    const asset = await db.mediaAsset.findUnique({ where: { id } })
    if (!asset) return json({ error: 'File not found' }, { status: 404 })
    await db.mediaAsset.delete({ where: { id } })

    // Remove the stored file too, unless another entry in Files points at the same one.
    // A file that only links to another website is left alone (there's nothing of ours to delete).
    const stillListed = await db.mediaAsset.count({ where: { url: asset.url } }).catch(() => 1)
    if (!stillListed) {
      const key = mediaBucketKey(asset.url)
      if (key) {
        try {
          const { env } = await getCloudflareContext({ async: true })
          await (env as any).MEDIA_BUCKET?.delete(key)
        } catch (e) { console.error('Could not remove the stored file', key, e) }
      } else if (process.env.NODE_ENV !== 'production') {
        const local = asset.url.match(/^\/uploads\/([^/?#]+)$/)
        if (local) await unlink(path.join(process.cwd(), 'public', 'uploads', path.basename(local[1]))).catch(() => {})
      }
    }

    await audit(actor.id, 'media.deleted', 'MediaAsset', id, { name: asset.name, url: asset.url })
    return json({ ok: true })
  } catch (e) {
    return routeError(e, 'Unable to delete file', 400)
  }
}
