import { db } from '@/lib/prisma'
import { hashPassword, requireUser, setSession, verifyPassword } from '@/lib/auth'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'

// Signed-in customers change their own password. Every other session for the account is signed
// out (sessionsRevokedAt); this device gets a fresh session so the customer stays signed in here.
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const limit = await consumeDurableRateLimit(`password-change:${user.id}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 })
    const body = await req.json().catch(() => ({}))
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const next = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (next.length < 8 || next.length > 72) return json({ error: 'Your new password must be 8 to 72 characters.' }, { status: 400 })
    if (!(await verifyPassword(current, user.passwordHash))) return json({ error: 'Your current password is incorrect.' }, { status: 400 })
    if (current === next) return json({ error: 'Choose a password different from your current one.' }, { status: 400 })
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), sessionsRevokedAt: new Date() } })
    await setSession(user.id)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to change password' }, { status: 400 })
  }
}
