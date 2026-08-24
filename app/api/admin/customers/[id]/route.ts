import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('customers.view')
    const { id } = await params
    const customer = await db.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        orders: { orderBy: { createdAt: 'desc' }, include: { items: true } },
        reviews: { orderBy: { createdAt: 'desc' }, include: { product: { select: { id: true, name: true, slug: true } } } },
        orderNotes: { orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } },
        _count: { select: { orders: true, reviews: true } },
      },
    })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })
    const orderTotal = customer.orders.reduce((sum, order) => sum + order.grandTotal, 0)
    return json({ customer: { ...customer, passwordHash: undefined, orderTotal } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json()
    const existing = await db.user.findFirst({ where: { id, role: 'CUSTOMER' } })
    if (!existing) return json({ error: 'Customer not found' }, { status: 404 })
    const data: any = {}
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return json({ error: 'Name cannot be empty' }, { status: 400 })
      data.name = name
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase()
      if (!email) return json({ error: 'Email cannot be empty' }, { status: 400 })
      const collision = await db.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } })
      if (collision) return json({ error: 'Another account already uses this email' }, { status: 409 })
      data.email = email
    }
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)
    const customer = await db.user.update({ where: { id }, data, select: { id: true, name: true, email: true, phone: true, isActive: true } })
    await audit(actor.id, 'customer.updated', 'User', id, { fields: Object.keys(data) })
    return json({ customer })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update customer' }, { status: 400 })
  }
}
