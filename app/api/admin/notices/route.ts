import { randomUUID } from 'node:crypto'
import { requirePermission, requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { sendTeamNoticePush } from '@/lib/push'
import { json } from '@/lib/utils'
import { getNotices, saveNotices } from '@/lib/team-notices-server'
import { activeNotices, addNotice, cleanNoticeText, expiryFor, keepChoice, noticeAge, noticeAlert, removeNotice } from '@/lib/team-notices'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  console.error('[admin/notices] failure', error)
  return json({ error: 'Unable to save the notice' }, { status: 500, headers: NO_STORE })
}

// What the banner shows right now, for any signed-in staff member: open pages ask for it when the app is
// opened, on a page change, when a phone alert arrives and every couple of minutes while on screen
// (components/team-notices.tsx), so a notice reaches pages that are already open.
export async function GET() {
  try {
    await requireStaff()
    const now = new Date()
    const notices = activeNotices(await getNotices(), now).map(n => ({ id: n.id, text: n.text, authorName: n.authorName, age: noticeAge(n.createdAt, now) }))
    return json({ notices }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}

// Admin > Team notices: post a notice (optionally with a phone alert to the team) and remove one.
// Only staff with "Post team notices" can; everyone on the staff can read them (shown on every admin page).
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('notices.manage')
    const body = await req.json().catch(() => ({}))
    const text = cleanNoticeText(body?.text)
    if (!text) return json({ error: 'Write the message first.' }, { status: 400, headers: NO_STORE })
    // A phone alert reaches the whole team, so posting is slowed down for anyone who floods it.
    const gate = await consumeDurableRateLimit(`team-notice:${actor.id}`, 10, 60 * 60 * 1000)
    if (!gate.allowed) return json({ error: 'You have posted a lot of notices in the last hour. Try again later.' }, { status: 429, headers: NO_STORE })
    const now = new Date()
    const alert = body?.alert === true
    const notice = { id: randomUUID().replace(/-/g, '').slice(0, 20), text, createdAt: now.toISOString(), expiresAt: expiryFor(keepChoice(body?.keep), now), authorName: actor.name || 'Staff', alerted: alert }
    const added = addNotice(await getNotices(), notice, now)
    if (!added.ok) return json({ error: added.error }, { status: 400, headers: NO_STORE })
    await saveNotices(added.list)
    if (alert) runInBackground(sendTeamNoticePush(noticeAlert(notice)).catch(error => console.error('[push] team notice alert failed', error)))
    await audit(actor.id, 'notice.created', 'TeamNotice', notice.id, { text: text.slice(0, 120), alert, keep: keepChoice(body?.keep) })
    return json({ ok: true, notices: added.list }, { status: 201, headers: NO_STORE })
  } catch (error) { return failure(error) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('notices.manage')
    const body = await req.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : ''
    const list = await getNotices()
    if (!list.some(n => n.id === id)) return json({ error: 'That notice is already gone.' }, { status: 404, headers: NO_STORE })
    const next = removeNotice(list, id)
    await saveNotices(next)
    await audit(actor.id, 'notice.removed', 'TeamNotice', id)
    return json({ ok: true, notices: next }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}
