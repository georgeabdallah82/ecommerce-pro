import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const params = new URL(req.url).searchParams
    const status = params.get('status') || undefined
    const q = params.get('q')?.trim() || ''
    const rows = await db.draftOrder.findMany({ where: { ...(status ? { status: status as any } : {}), ...(q ? { OR: [{ orderNumber: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, include: { items: true }, orderBy: { updatedAt: 'desc' }, take: 100 })
    return json(rows)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const b = await req.json()
    const email = String(b.email || '').trim()
    const rawItems = Array.isArray(b.items) ? b.items : []
    if (!email || !rawItems.length) return json({ error: 'Email and at least one item are required' }, { status: 400 })
    const ids: string[] = Array.from(new Set<string>(rawItems.map((x: any) => String(x.productId || '')).filter((x: string) => x.length > 0)))
    const products = await db.product.findMany({ where: { id: { in: ids } }, include: { variants: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    const items = rawItems.map((raw: any) => {
      const product = byId.get(String(raw.productId))
      if (!product) throw new Error('A selected product no longer exists')
      const variant = raw.variantId ? product.variants.find(v => v.id === String(raw.variantId)) : undefined
      if (raw.variantId && !variant) throw new Error(`Invalid variant for ${product.name}`)
      const quantity = Math.max(1, Math.min(999, Math.trunc(Number(raw.quantity) || 1)))
      const unitPrice = Number.isFinite(Number(raw.unitPrice)) ? Math.max(0, Math.trunc(Number(raw.unitPrice))) : (variant?.price ?? product.basePrice)
      return { productId: product.id, variantId: variant?.id ?? null, name: product.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? product.sku, quantity, unitPrice, totalPrice: quantity * unitPrice }
    })
    const subtotal = items.reduce((s: number, i: any) => s + i.totalPrice, 0)
    const discountTotal = Math.max(0, Math.trunc(Number(b.discountTotal) || 0))
    const shippingTotal = Math.max(0, Math.trunc(Number(b.shippingTotal) || 0))
    const taxTotal = Math.max(0, Math.trunc(Number(b.taxTotal) || 0))
    const grandTotal = Math.max(0, subtotal - discountTotal + shippingTotal + taxTotal)
    const draft = await db.draftOrder.create({ data: {
      orderNumber: `DRAFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      customerId: b.customerId ? String(b.customerId) : null,
      email,
      phone: b.phone ? String(b.phone) : null,
      subtotal,
      discountTotal,
      shippingTotal,
      taxTotal,
      grandTotal,
      currency: String(b.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD'),
      shippingAddressJson: b.shippingAddress ? JSON.stringify(b.shippingAddress) : null,
      billingAddressJson: b.billingAddress ? JSON.stringify(b.billingAddress) : null,
      notes: b.notes ? String(b.notes) : null,
      items: { create: items },
    }, include: { items: true } })
    await audit(actor.id, 'draft_order.created', 'DraftOrder', draft.id, { orderNumber: draft.orderNumber, total: draft.grandTotal })
    return json({ draftOrder: draft }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create draft order' }, { status: 400 }) }
}
