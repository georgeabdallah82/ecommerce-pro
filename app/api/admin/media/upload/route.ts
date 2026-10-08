import { routeError } from '@/lib/api-error'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { saveMediaBytes } from '@/lib/media-storage'

// Storage (R2 on Workers, public/uploads in local dev) lives in lib/media-storage.ts.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('media.manage')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'File required' }, { status: 400 })
    if (!file.type.startsWith('image/')) return json({ error: 'Only image files are allowed' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return json({ error: 'Maximum file size is 5 MB' }, { status: 400 })

    const asset = await saveMediaBytes(new Uint8Array(await file.arrayBuffer()), file.type, file.name, String(form.get('alt') || file.name))
    await audit(actor.id, 'media.uploaded', 'MediaAsset', asset.id, { name: file.name, size: file.size })
    return json({ asset }, { status: 201 })
  } catch (e) {
    return routeError(e, 'Unable to upload image', 400)
  }
}
