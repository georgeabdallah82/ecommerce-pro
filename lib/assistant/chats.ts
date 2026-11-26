import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/prisma'
import type { ChatLang } from './language'
import { redact } from './redact'

// Chats are tied to the browser by an http-only cookie: only its hash is stored, and a chat can be
// continued only from the browser that started it. Kept 90 days (pruneAssistantData).

export const VISITOR_COOKIE = 'chat_visitor'
export const VISITOR_COOKIE_MAX_AGE = 90 * 86_400

export const newVisitorId = () => randomBytes(24).toString('base64url')
export const visitorKeyOf = (cookie: string) => createHash('sha256').update(`assistant:${cookie}`).digest('hex')
export const isVisitorId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(value)

// At most this many shopper messages in one chat; then the widget offers a new chat.
export const MAX_CHAT_MESSAGES = 40

export async function openConversation(input: { conversationId?: unknown; visitorKey: string; userId: string | null; lang: ChatLang }) {
  const id = typeof input.conversationId === 'string' && /^[a-z0-9]{10,40}$/i.test(input.conversationId) ? input.conversationId : ''
  if (id) {
    const found = await db.assistantConversation.findUnique({ where: { id }, select: { id: true, visitorKey: true, messageCount: true, userId: true } })
    // Someone else's chat id is treated like no id: a new chat starts.
    if (found && found.visitorKey === input.visitorKey) {
      if (input.userId && !found.userId) await db.assistantConversation.update({ where: { id }, data: { userId: input.userId } }).catch(() => null)
      return { id: found.id, messageCount: found.messageCount, isNew: false }
    }
  }
  const created = await db.assistantConversation.create({ data: { visitorKey: input.visitorKey, userId: input.userId, lang: input.lang }, select: { id: true } })
  return { id: created.id, messageCount: 0, isNew: true }
}

// The last few turns of a chat, oldest first, for Claude's context.
export async function recentTurns(conversationId: string, limit = 10) {
  const rows = await db.assistantMessage.findMany({ where: { conversationId }, select: { role: true, text: true }, orderBy: { createdAt: 'desc' }, take: limit })
  return rows.reverse().filter(r => r.role === 'user' || r.role === 'assistant').map(r => ({ role: r.role as 'user' | 'assistant', text: r.text }))
}

export type SavedTurn = {
  userText: string
  userKind: 'message' | 'action'
  reply: string
  replyKind: 'ai' | 'action' | 'fallback' | 'limit'
  productIds: string[]
  searches: string[]
  answered: boolean
  escalated: boolean
  lang: ChatLang
  inputTokens?: number
  outputTokens?: number
  costMicros?: number
}

export async function saveTurn(conversationId: string, turn: SavedTurn) {
  const now = Date.now()
  // No shopper text: an answer on its own (the AI stepping in for a person in live chat).
  await db.$transaction([
    ...(turn.userText ? [db.assistantMessage.create({ data: { conversationId, role: 'user', kind: turn.userKind, text: redact(turn.userText).slice(0, 600), createdAt: new Date(now) } })] : []),
    db.assistantMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        kind: turn.replyKind,
        text: redact(turn.reply).slice(0, 4000),
        productIdsJson: turn.productIds.length ? JSON.stringify(turn.productIds) : null,
        searchesJson: turn.searches.length ? JSON.stringify(turn.searches.map(s => redact(s).slice(0, 80)).slice(0, 6)) : null,
        answered: turn.answered,
        inputTokens: turn.inputTokens || 0,
        outputTokens: turn.outputTokens || 0,
        costMicros: turn.costMicros || 0,
        // A millisecond later, so the order is kept when sorted by time.
        createdAt: new Date(now + 1),
      },
    }),
    db.assistantConversation.update({
      where: { id: conversationId },
      data: {
        ...(turn.userText ? { messageCount: { increment: 1 } } : {}),
        lang: turn.lang,
        ...(turn.answered ? {} : { unanswered: true }),
        ...(turn.escalated ? { escalated: true } : {}),
        ...(turn.costMicros ? { costMicros: { increment: turn.costMicros } } : {}),
      },
    }),
  ])
}
