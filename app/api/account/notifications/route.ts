import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function PATCH(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const id = typeof (body as Record<string, unknown> | null)?.id === 'string' ? (body as Record<string, string>).id : null
    const now = new Date()

    if (id) {
      const existing = await db.notification.findFirst({ where: { id, userId: user.id }, select: { id: true } })
      if (!existing) return json({ error: 'Notification not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
      await db.notification.update({ where: { id }, data: { readAt: now } })
      return json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: now } })
    return json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to update notifications' }, {
      status: message === 'UNAUTHORIZED' ? 401 : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
