import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { Role, OrderStatus } from '@prisma/client'
import { sumCustomerSpend } from '@/lib/orders'
import { deleteCustomerCascade } from '@/lib/customers'

function sanitizeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHORIZED') return { status: 401, error: 'Unauthorized' }
  if (message === 'FORBIDDEN') return { status: 403, error: 'Forbidden' }
  console.error('[admin/customers/:id] unexpected failure', error)
  return { status: 500, error: 'Unable to process customer request' }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('customers.view')
    const { id } = await params
    if (!id || id.length > 100) return json({ error: 'Customer not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })

    const customer = await db.user.findFirst({
      where: { id, role: Role.CUSTOMER },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          select: {
            id: true, label: true, firstName: true, lastName: true, line1: true, line2: true,
            city: true, region: true, postalCode: true, country: true, phone: true, isDefault: true, createdAt: true,
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true, orderNumber: true, email: true, phone: true, subtotal: true, discountTotal: true,
            shippingTotal: true, taxTotal: true, grandTotal: true, currency: true, status: true,
            paymentStatus: true, fulfillmentStatus: true, paymentMethod: true, couponCode: true,
            shippingAddressJson: true, billingAddressJson: true, notes: true, trackingNumber: true,
            shippingMethod: true, createdAt: true, updatedAt: true,
            items: { select: { id: true, productId: true, variantId: true, name: true, sku: true, quantity: true, unitPrice: true, totalPrice: true } },
            paymentTransactions: { select: { status: true, amount: true } },
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true, productId: true, rating: true, title: true, body: true, approved: true, featured: true, createdAt: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
        orderNotes: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, orderId: true, body: true, createdAt: true, user: { select: { name: true } } },
        },
        _count: { select: { orders: true, reviews: true } },
      },
    })

    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    // Extended (Accelerate) client payload inference doesn't always widen nested `select`
    // relations correctly, so this access is asserted to the shape actually queried.
    const orderTotal = sumCustomerSpend((customer as unknown as { orders: { status: OrderStatus; grandTotal: number; paymentTransactions: { status: string; amount: number }[] }[] }).orders)
    return json({ customer: { ...customer, orderTotal } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    if (!id || id.length > 100) return json({ error: 'Customer not found' }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const existing = await db.user.findFirst({ where: { id, role: Role.CUSTOMER }, select: { id: true } })
    if (!existing) return json({ error: 'Customer not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 120)
      if (!name) return json({ error: 'Name cannot be empty' }, { status: 400 })
      data.name = name
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase().slice(0, 254)
      if (!email || !email.includes('@')) return json({ error: 'A valid email is required' }, { status: 400 })
      const collision = await db.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } })
      if (collision) return json({ error: 'Another account already uses this email' }, { status: 409 })
      data.email = email
    }
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim().slice(0, 50) : null
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

    const customer = await db.user.update({ where: { id }, data, select: { id: true, name: true, email: true, phone: true, isActive: true } })
    await audit(actor.id, 'customer.updated', 'User', id, { fields: Object.keys(data) })
    return json({ customer }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    if (!id || id.length > 100) return json({ error: 'Customer not found' }, { status: 404 })
    const existing = await db.user.findFirst({ where: { id, role: Role.CUSTOMER }, select: { id: true, email: true } })
    if (!existing) return json({ error: 'Customer not found' }, { status: 404 })

    await db.$transaction(async tx => { await deleteCustomerCascade(tx, id) })

    await audit(actor.id, 'customer.deleted', 'User', id, { email: existing.email })
    return json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
