import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { consumeRateLimit } from '@/lib/rate-limit'
import { json } from '@/lib/utils'
import { signTicket } from '@/lib/live-chat/ticket'
import { liveRelayAvailable } from '@/lib/live-chat/relay'
import { MAX_MESSAGE, channelFor, channelsFor, deleteMessage, directChannel, markRead, messagesIn, sendMessage, setMuted, staffMembers } from '@/lib/team-chat/server'

// Admin › Team chat (components/admin-team-chat.tsx). Any signed-in staff member: the team room and
// their own direct chats only (channelFor). Docs: docs/team-chat-2026-11.md.

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const ID = /^[a-z0-9]{10,40}$/i

function failure(error: unknown) {
  if (error instanceof Error && (error.message === 'FORBIDDEN' || error.message === 'UNAUTHORIZED')) return json({ error: 'Sign in as staff to use Team chat.' }, { status: 401, headers: NO_STORE })
  console.error('[admin/team-chat] failure', error)
  return json({ error: 'Team chat is not available right now.' }, { status: 500, headers: NO_STORE })
}

// Without ?c: the chats list, the staff list (to start a direct chat) and a pass for the live connection.
// With ?c=<channel>: its latest messages (marks it read), or older ones with &before=<time>.
export async function GET(req: Request) {
  try {
    const user = await requireStaff()
    const url = new URL(req.url)
    const channelId = url.searchParams.get('c') || ''
    if (channelId) {
      if (!ID.test(channelId) || !(await channelFor(user.id, channelId))) return json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
      const before = url.searchParams.get('before')
      const messages = await messagesIn(channelId, user.id, before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null)
      return json({ messages }, { headers: NO_STORE })
    }
    const [channels, staff, available] = await Promise.all([channelsFor(user.id), staffMembers(), liveRelayAvailable()])
    const ticket = available ? await signTicket(process.env.AUTH_SECRET || '', { role: 'team', conversationId: null, userId: user.id }).catch(() => null) : null
    return json({ me: { id: user.id, isOwner: user.role === 'SUPER_ADMIN' }, channels, staff: staff.filter(s => s.id !== user.id), ticket }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}

export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => null) as { action?: unknown; channelId?: unknown; userId?: unknown; text?: unknown; messageId?: unknown; muted?: unknown } | null
    const action = body?.action
    if (action === 'dm') {
      const otherId = typeof body?.userId === 'string' && ID.test(body.userId) ? body.userId : ''
      const channel = otherId ? await directChannel(user.id, otherId) : null
      return channel ? json({ channelId: channel.id }, { headers: NO_STORE }) : json({ error: 'That person is not on the staff.' }, { status: 404, headers: NO_STORE })
    }
    if (action === 'delete') {
      const messageId = typeof body?.messageId === 'string' && ID.test(body.messageId) ? body.messageId : ''
      if (!messageId) return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
      const result = await deleteMessage(messageId, user)
      if (!result.ok) return json({ error: result.error }, { status: result.status, headers: NO_STORE })
      await audit(user.id, 'teamchat.message.deleted', 'StaffMessage', messageId, { channelId: result.channelId })
      return json({ ok: true }, { headers: NO_STORE })
    }
    const channelId = typeof body?.channelId === 'string' && ID.test(body.channelId) ? body.channelId : ''
    const channel = channelId ? await channelFor(user.id, channelId) : null
    if (!channel) return json({ error: 'That chat was not found.' }, { status: 404, headers: NO_STORE })
    if (action === 'send') {
      const text = typeof body?.text === 'string' ? body.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : ''
      if (!text) return json({ error: 'Write a message first.' }, { status: 400, headers: NO_STORE })
      if (text.length > MAX_MESSAGE) return json({ error: `Messages can be up to ${MAX_MESSAGE} characters.` }, { status: 400, headers: NO_STORE })
      if (!consumeRateLimit(`team-chat:${user.id}`, 60, 60 * 1000).allowed) return json({ error: 'You are sending messages very fast. Wait a moment.' }, { status: 429, headers: NO_STORE })
      return json({ message: await sendMessage(channel, user, text) }, { headers: NO_STORE })
    }
    if (action === 'read') { await markRead(channel.id, user.id); return json({ ok: true }, { headers: NO_STORE }) }
    if (action === 'mute') { await setMuted(channel.id, user.id, body?.muted === true); return json({ ok: true, muted: body?.muted === true }, { headers: NO_STORE }) }
    return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
  } catch (error) { return failure(error) }
}
