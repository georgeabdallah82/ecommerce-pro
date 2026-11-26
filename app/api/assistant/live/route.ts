import { cookies } from 'next/headers'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { clientIp } from '@/lib/request-ip'
import { consumeRateLimit } from '@/lib/rate-limit'
import { loadAssistantConfig } from '@/lib/assistant/settings'
import { VISITOR_COOKIE, isVisitorId, visitorKeyOf } from '@/lib/assistant/chats'
import { signTicket } from '@/lib/live-chat/ticket'
import { getPresence } from '@/lib/live-chat/relay'
import { repliesSince } from '@/lib/live-chat/server'

// The chat window asks this when it opens or reconnects (components/assistant-widget.tsx): whether
// someone from the store is online (and their name), a pass for the live connection to this browser's
// own chat (lib/live-chat/ticket.ts), and the replies it missed since `after`. No database call when
// the shopper has no chat yet.

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const config = await loadAssistantConfig()
  if (!config.enabled) return json({ online: false }, { headers: NO_STORE })
  if (!consumeRateLimit(`assistant:live:${clientIp(request.headers)}`, 60, 10 * 60 * 1000).allowed) return json({ error: 'Too many requests.' }, { status: 429, headers: NO_STORE })
  const body = await request.json().catch(() => null) as { conversationId?: unknown; after?: unknown } | null
  const presence = await getPresence()
  const result: { online: boolean; name: string; ticket?: string; messages?: Awaited<ReturnType<typeof repliesSince>> } = { online: presence.online, name: presence.online ? presence.name || config.storeName : '' }

  const conversationId = typeof body?.conversationId === 'string' && /^[a-z0-9]{10,40}$/i.test(body.conversationId) ? body.conversationId : ''
  const cookie = (await cookies()).get(VISITOR_COOKIE)?.value
  if (conversationId && isVisitorId(cookie)) {
    const chat = await db.assistantConversation.findUnique({ where: { id: conversationId }, select: { visitorKey: true } })
    // Only this browser's own chat.
    if (chat && chat.visitorKey === visitorKeyOf(cookie)) {
      result.ticket = await signTicket(process.env.AUTH_SECRET || '', { role: 'shopper', conversationId }).catch(() => undefined)
      const after = typeof body?.after === 'string' && !Number.isNaN(Date.parse(body.after)) ? new Date(body.after) : null
      if (after) result.messages = await repliesSince(conversationId, after)
    }
  }
  return json(result, { headers: NO_STORE })
}
