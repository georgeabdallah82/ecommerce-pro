import { routeError } from '@/lib/api-error'
import { pagedReply, readPaging } from '@/lib/admin-paging'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/prisma'; import { requirePermission } from '@/lib/auth'; import { audit } from '@/lib/audit'; import { json } from '@/lib/utils'

// The library, newest first, a page at a time (48 by default, 120 at most). `q` matches the name or the alt text.
export async function GET(req: Request) {
  try {
    await requirePermission('media.view')
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim().slice(0, 120)
    const { skip, take } = readPaging(searchParams, 48, 120)
    const where: Prisma.MediaAssetWhereInput = {}
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { alt: { contains: q, mode: 'insensitive' } }]
    const [rows, total] = await Promise.all([
      db.mediaAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
      db.mediaAsset.count({ where }),
    ])
    return json(pagedReply(rows, total, skip, take))
  } catch (e) {
    return routeError(e, 'Forbidden', 403)
  }
}
export async function POST(req:Request){try{const actor=await requirePermission('media.manage');const b=await req.json();const url=String(b.url||'').trim();const name=String(b.name||url.split('/').pop()||'Asset');if(!url)return json({error:'URL required'},{status:400});if(/(^|\.)(drive|docs)\.google\.com$/i.test(new URL(url).hostname))return json({error:'Google Drive links are not supported — they get rate-limited and break your storefront. Use Upload instead.'},{status:400});const a=await db.mediaAsset.create({data:{url,name,alt:b.alt?String(b.alt):null,mimeType:b.mimeType?String(b.mimeType):null,width:b.width?Number(b.width):null,height:b.height?Number(b.height):null,sizeBytes:b.sizeBytes?Number(b.sizeBytes):null}});await audit(actor.id,'media.created','MediaAsset',a.id,{url});return json({asset:a},{status:201})}catch(e){return routeError(e, 'Unable to create media asset', 400)}}
