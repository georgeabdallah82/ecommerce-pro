import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('products.view')
    const params = new URL(req.url).searchParams
    const productId = params.get('productId')
    const channelId = params.get('channelId')
    return json(await db.productPublication.findMany({ where: { ...(productId ? { productId } : {}), ...(channelId ? { channelId } : {}) }, include: { channel: true }, orderBy: { channel: { name: 'asc' } } }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const b = await req.json()
    const productId = String(b.productId || '')
    const channelId = String(b.channelId || '')
    if (!productId || !channelId) return json({ error: 'productId and channelId are required' }, { status: 400 })
    const publication = await db.productPublication.upsert({ where: { productId_channelId: { productId, channelId } }, update: { available: b.available !== false, publishedAt: b.available === false ? null : (b.publishedAt ? new Date(b.publishedAt) : new Date()) }, create: { productId, channelId, available: b.available !== false, publishedAt: b.available === false ? null : new Date() }, include: { channel: true } })
    await audit(actor.id, 'product.publication.updated', 'ProductPublication', publication.id, { productId, channelId, available: publication.available })
    return json({ publication })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to publish product to channel' }, { status: 400 }) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const params = new URL(req.url).searchParams
    const productId = String(params.get('productId') || '')
    const channelId = String(params.get('channelId') || '')
    if (!productId || !channelId) return json({ error: 'productId and channelId are required' }, { status: 400 })
    await db.productPublication.delete({ where: { productId_channelId: { productId, channelId } } })
    await audit(actor.id, 'product.publication.deleted', 'ProductPublication', undefined, { productId, channelId })
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to unpublish product' }, { status: 400 }) }
}
