import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { routeError } from '@/lib/api-error'

// Signs a staff member out of every device. Any session started before now stops working, the same
// mark a password change leaves (sessionsRevokedAt). They can sign in again straight away.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const body = await req.json().catch(() => ({})) as { id?: unknown }
    const targetId = String(body.id || '').trim()
    if (!targetId) return json({ error: 'User id is required' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true, name: true, role: true } })
    if (!target) return json({ error: 'User not found' }, { status: 404 })
    if (target.role === 'CUSTOMER') return json({ error: 'Customer accounts are managed from Customers' }, { status: 409 })
    if (target.id === actor.id) return json({ error: 'You cannot sign yourself out everywhere from here. Use Sign out in the menu.' }, { status: 400 })
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') return json({ error: 'Only the super admin can sign out a super admin' }, { status: 403 })

    await db.user.update({ where: { id: target.id }, data: { sessionsRevokedAt: new Date() } })
    await audit(actor.id, 'user.signed_out_everywhere', 'User', target.id, { name: target.name })
    return json({ ok: true })
  } catch (e) {
    return routeError(e, 'Unable to sign them out right now', 400)
  }
}
