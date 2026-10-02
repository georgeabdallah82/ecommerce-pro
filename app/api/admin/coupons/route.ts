import { db } from '@/lib/prisma'; import { requirePermission } from '@/lib/auth'; import { audit } from '@/lib/audit'; import { json } from '@/lib/utils'
function scope(input: any) { return ['ALL_PRODUCTS', 'SPECIFIC_PRODUCTS', 'SPECIFIC_COLLECTIONS'].includes(input) ? input : 'ALL_PRODUCTS' }
function ids(input: any) { return Array.isArray(input) ? input.map(String).filter(Boolean).slice(0, 200) : [] }
function targeting(b: any) { return { appliesTo: scope(b.appliesTo), productIds: ids(b.productIds), collectionIds: ids(b.collectionIds), buyQuantity: b.buyQuantity ? Math.max(1, Math.trunc(Number(b.buyQuantity))) : null, getQuantity: b.getQuantity ? Math.max(1, Math.trunc(Number(b.getQuantity))) : null, getDiscountPercent: b.getDiscountPercent !== undefined && b.getDiscountPercent !== '' ? Math.min(100, Math.max(0, Math.trunc(Number(b.getDiscountPercent)))) : null, getAppliesTo: b.getAppliesTo ? scope(b.getAppliesTo) : null, getProductIds: ids(b.getProductIds), getCollectionIds: ids(b.getCollectionIds) } }
const TYPES = ['PERCENTAGE', 'FIXED', 'FREE_SHIPPING', 'BUY_X_GET_Y']

// Every editable field of a discount, shared by create and the full edit (PATCH with `code`).
function couponFields(b: any): { error: string } | { data: any } {
  const code = String(b.code || '').trim().toUpperCase().slice(0, 64)
  if (!code) return { error: 'Code required' }
  const type = TYPES.includes(b.type) ? b.type : 'PERCENTAGE'
  const value = Math.max(0, Math.trunc(Number(b.value) || 0))
  if (type === 'PERCENTAGE' && (value < 1 || value > 100)) return { error: 'Percentage must be between 1 and 100.' }
  const startsAt = b.startsAt ? new Date(b.startsAt) : null
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null
  if (startsAt && expiresAt && expiresAt <= startsAt) return { error: 'The end date must be after the start date.' }
  return { data: {
    code, type, isAutomatic: Boolean(b.isAutomatic),
    value: type === 'FREE_SHIPPING' || type === 'BUY_X_GET_Y' ? 0 : value,
    minSubtotal: b.minSubtotal ? Math.trunc(Number(b.minSubtotal)) : null,
    maxUses: b.maxUses ? Math.trunc(Number(b.maxUses)) : null,
    startsAt, expiresAt, firstOrderOnly: Boolean(b.firstOrderOnly), ...targeting(b),
  } }
}
function saveError(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : ''
  if (message.includes('Unique constraint')) return json({ error: 'A discount with this code already exists.' }, { status: 409 })
  if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Forbidden' }, { status: message === 'UNAUTHORIZED' ? 401 : 403 })
  return json({ error: message || fallback }, { status: 400 })
}

export async function GET(){try{await requirePermission('coupons.view');return json(await db.coupon.findMany({orderBy:{createdAt:'desc'},take:500}))}catch(e){return json({error:e instanceof Error?e.message:'Forbidden'},{status:403})}}
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage'); const b = await req.json()
    const fields = couponFields(b); if ('error' in fields) return json({ error: fields.error }, { status: 400 })
    const c = await db.coupon.create({ data: { ...fields.data, isActive: b.isActive !== false } })
    await audit(actor.id, 'coupon.created', 'Coupon', c.id, { code: c.code, isAutomatic: c.isAutomatic, type: c.type })
    return json({ coupon: c }, { status: 201 })
  } catch (e) { return saveError(e, 'Unable to create coupon') }
}
export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage'); const b = await req.json()
    const id = String(b.id || ''); if (!id) return json({ error: 'Discount id required' }, { status: 400 })
    // With `code` this is a full edit from the discount form; without it, a quick toggle.
    let data: any
    if (b.code !== undefined) { const fields = couponFields(b); if ('error' in fields) return json({ error: fields.error }, { status: 400 }); data = fields.data }
    else data = { ...(b.isAutomatic !== undefined ? { isAutomatic: Boolean(b.isAutomatic) } : {}), ...(b.value !== undefined ? { value: Math.max(0, Math.trunc(Number(b.value) || 0)) } : {}), ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } : {}), ...(b.appliesTo !== undefined ? targeting(b) : {}) }
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive)
    const c = await db.coupon.update({ where: { id }, data })
    await audit(actor.id, 'coupon.updated', 'Coupon', c.id, { fields: Object.keys(data) })
    return json({ coupon: c })
  } catch (e) { return saveError(e, 'Unable to update coupon') }
}
export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const id = new URL(req.url).searchParams.get('id') || ''
    const existing = id ? await db.coupon.findUnique({ where: { id } }) : null
    if (!existing) return json({ error: 'Discount not found' }, { status: 404 })
    // Orders keep their own copy of the code and amount, so past orders are unaffected.
    await db.coupon.delete({ where: { id } })
    await audit(actor.id, 'coupon.deleted', 'Coupon', id, { code: existing.code })
    return json({ ok: true })
  } catch (e) { return saveError(e, 'Unable to delete coupon') }
}
