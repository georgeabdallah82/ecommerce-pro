import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
export const WHOLESALE_STATUSES = ['NEW', 'CONTACTED', 'WON', 'NOT_A_FIT'] as const

// Admin > Customers > Wholesale inquiries: set a status, or delete an inquiry (for example a test).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json().catch(() => null)
    const status = typeof body?.status === 'string' ? body.status : ''
    if (!(WHOLESALE_STATUSES as readonly string[]).includes(status)) return json({ error: 'Choose a valid status' }, { status: 400, headers: NO_STORE })
    const row = await db.wholesaleInquiry.update({
      where: { id },
      data: { status, handledAt: status === 'NEW' ? null : new Date() },
      select: { id: true, status: true, handledAt: true },
    })
    await audit(actor.id, 'wholesale.status', 'WholesaleInquiry', id, { status })
    return json(row, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Sign in first' }, { status: 401, headers: NO_STORE })
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
    console.error('[admin/wholesale] update failed', error)
    return json({ error: 'Unable to update this inquiry' }, { status: 500, headers: NO_STORE })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const removed = await db.wholesaleInquiry.delete({ where: { id }, select: { id: true, businessName: true } })
    await audit(actor.id, 'wholesale.delete', 'WholesaleInquiry', id, { businessName: removed.businessName })
    return json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Sign in first' }, { status: 401, headers: NO_STORE })
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
    console.error('[admin/wholesale] delete failed', error)
    return json({ error: 'Unable to delete this inquiry' }, { status: 500, headers: NO_STORE })
  }
}
