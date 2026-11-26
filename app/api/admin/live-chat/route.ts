import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { signTicket } from '@/lib/live-chat/ticket'
import { getPresence, liveRelayAvailable, setPresence } from '@/lib/live-chat/relay'
import { MAX_REPLY, liveInbox, liveThread, saveAgentReply } from '@/lib/live-chat/server'

// Admin › Live chat (app/admin/online-store/assistant/live): the "I'm online" switch, the inbox, one
// chat, replies, and the pass for the page's live connection. Staff who can see the AI assistant's
// chats (assistant.view, which the Support role has) can answer them.

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const firstName = (user: { name: string | null; email: string }) => (user.name || user.email.split('@')[0]).trim().split(/\s+/)[0].slice(0, 40)

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'You do not have permission to use live chat.' }, { status: 403, headers: NO_STORE })
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  console.error('[admin/live-chat] failure', error)
  return json({ error: 'Live chat is not available right now.' }, { status: 500, headers: NO_STORE })
}

export async function GET(req: Request) {
  try {
    await requirePermission('assistant.view')
    const id = new URL(req.url).searchParams.get('c') || ''
    if (id) {
      if (!/^[a-z0-9]{10,40}$/i.test(id)) return json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
      const thread = await liveThread(id)
      return thread ? json({ thread }, { headers: NO_STORE }) : json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    }
    const [presence, inbox, available] = await Promise.all([getPresence(), liveInbox(), liveRelayAvailable()])
    const ticket = available ? await signTicket(process.env.AUTH_SECRET || '', { role: 'staff', conversationId: null }).catch(() => null) : null
    return json({ presence, inbox, available, ticket }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('assistant.view')
    const body = await req.json().catch(() => null) as { action?: unknown; online?: unknown; conversationId?: unknown; text?: unknown } | null
    if (body?.action === 'presence') {
      const online = body.online === true
      const presence = await setPresence(online, firstName(user))
      if (!presence) return json({ error: 'Live chat only works on the live store (Cloudflare).' }, { status: 503, headers: NO_STORE })
      await audit(user.id, online ? 'livechat.online' : 'livechat.offline', 'LiveChat', 'presence')
      return json({ presence }, { headers: NO_STORE })
    }
    if (body?.action === 'reply') {
      const conversationId = typeof body.conversationId === 'string' && /^[a-z0-9]{10,40}$/i.test(body.conversationId) ? body.conversationId : ''
      const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : ''
      if (!conversationId || !text) return json({ error: 'Write a reply first.' }, { status: 400, headers: NO_STORE })
      if (text.length > MAX_REPLY) return json({ error: `Replies can be up to ${MAX_REPLY} characters.` }, { status: 400, headers: NO_STORE })
      const exists = await db.assistantConversation.findUnique({ where: { id: conversationId }, select: { id: true } })
      if (!exists) return json({ error: 'That chat was deleted.' }, { status: 404, headers: NO_STORE })
      const message = await saveAgentReply(conversationId, text, firstName(user))
      return json({ message }, { headers: NO_STORE })
    }
    return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
  } catch (error) { return failure(error) }
}
