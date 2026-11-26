import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { publish } from '@/lib/live-chat/relay'

// Admin › AI assistant / Live chat: delete one chat with all its messages. Only staff who can change
// the assistant (assistant.manage: the owner and admins); Support can read and reply but not delete.
// Chats are also deleted on their own after 90 days (lib/assistant/settings.ts pruneAssistantData).

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('assistant.manage')
    const body = await req.json().catch(() => null) as { id?: unknown } | null
    const id = typeof body?.id === 'string' && /^[a-z0-9]{10,40}$/i.test(body.id) ? body.id : ''
    if (!id) return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    const chat = await db.assistantConversation.findUnique({ where: { id }, select: { messageCount: true, live: true, createdAt: true } })
    if (!chat) return json({ ok: true }, { headers: NO_STORE })
    await db.assistantConversation.delete({ where: { id } })
    await audit(actor.id, 'assistant.chat.deleted', 'AssistantConversation', id, { messages: chat.messageCount, live: chat.live, started: chat.createdAt.toISOString() })
    // Other staff devices on Live chat refresh their inbox.
    await publish('staff', { type: 'waiting', conversationId: id, waiting: false })
    return json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Only the owner or an admin can delete chats.' }, { status: 403, headers: NO_STORE })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    console.error('[admin/assistant/conversations] delete failed', error)
    return json({ error: 'The chat could not be deleted. Please try again.' }, { status: 500, headers: NO_STORE })
  }
}
