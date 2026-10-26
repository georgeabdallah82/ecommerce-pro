import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { clearSession, requireUser, verifyPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { deleteCustomerCascade } from '@/lib/customers'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

// A customer deletes their own account, after typing their password again. The store keeps their
// past orders for its records (accounting and tax), but they are no longer linked to the account;
// addresses, reviews, wishlist, notifications, wallet and coin history are removed. Staff accounts
// can't be removed this way.
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    if (user.role !== 'CUSTOMER') return json({ error: 'Forbidden' }, { status: 403 })
    const limit = await consumeDurableRateLimit(`account-delete:${user.id}`, 5, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please wait a while and try again.' }, { status: 429 })
    const body = await req.json().catch(() => ({}))
    const password = typeof body.password === 'string' ? body.password : ''
    if (!(await verifyPassword(password, user.passwordHash))) return json({ error: 'Your password is incorrect.' }, { status: 400 })
    await audit(null, 'customer.self_deleted', 'User', user.id)
    await deleteCustomerCascade(db, user.id)
    await clearSession()
    return json({ ok: true })
  } catch (e) {
    return routeError(e, 'Unable to delete your account right now', 400)
  }
}
