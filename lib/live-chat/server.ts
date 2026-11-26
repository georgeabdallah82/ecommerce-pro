import { db } from '@/lib/prisma'
import { redactCards } from '@/lib/assistant/redact'
import { sendLiveChatAlert } from '@/lib/push'
import { runInBackground } from '@/lib/background'
import { publish } from './relay'

// Live chat: the store's people answering shoppers in the same chat window as the AI shopping
// assistant. While the owner's "I'm online" switch is on (lib/live-chat/hub.ts), a shopper's typed
// message goes to Admin › Live chat instead of the AI; the reply comes back to the shopper at once
// through the relay. Messages are saved here, in the same chat tables as the assistant's.
// Docs: docs/live-chat-2026-11.md.

// The AI steps in when nobody from the store has replied after this long (the shopper's chat window
// asks; app/api/assistant action "ai_fallback").
export const AI_FALLBACK_MS = 3 * 60 * 1000
export const MAX_REPLY = 2000

export type LiveMessage = { id: string; role: 'user' | 'assistant' | 'agent'; text: string; at: string; author?: string }

const asLive = (m: { id: string; role: string; text: string; createdAt: Date; author: string | null }): LiveMessage => ({
  id: m.id,
  role: m.role === 'agent' ? 'agent' : m.role === 'user' ? 'user' : 'assistant',
  text: m.text,
  at: m.createdAt.toISOString(),
  ...(m.author ? { author: m.author } : {}),
})

// A shopper's message while the store is online: saved (card numbers hidden), the chat marked as
// waiting, staff told at once, and a phone alert for the first message of a wait.
export async function saveShopperLiveMessage(conversationId: string, text: string, lang: string) {
  const now = new Date()
  const before = await db.assistantConversation.findUnique({ where: { id: conversationId }, select: { waitingSince: true } })
  const [message] = await db.$transaction([
    db.assistantMessage.create({ data: { conversationId, role: 'user', kind: 'live', text: redactCards(text).slice(0, 600), createdAt: now }, select: { id: true, role: true, text: true, createdAt: true, author: true } }),
    db.assistantConversation.update({ where: { id: conversationId }, data: { messageCount: { increment: 1 }, lang, live: true, ...(before?.waitingSince ? {} : { waitingSince: now }) } }),
  ])
  const live = asLive(message)
  await publish('staff', { type: 'message', conversationId, message: live })
  if (!before?.waitingSince) {
    await publish('staff', { type: 'waiting', conversationId, waiting: true })
    runInBackground(sendLiveChatAlert({ conversationId, preview: text }).catch(error => console.error('[live-chat] alert failed', error)))
  }
  return live
}

// A reply from the store: saved, the wait cleared, and passed to the shopper and the other staff devices.
export async function saveAgentReply(conversationId: string, text: string, author: string) {
  const [message] = await db.$transaction([
    db.assistantMessage.create({ data: { conversationId, role: 'agent', kind: 'live', text: text.slice(0, MAX_REPLY), author: author.slice(0, 60) || 'Team' }, select: { id: true, role: true, text: true, createdAt: true, author: true } }),
    db.assistantConversation.update({ where: { id: conversationId }, data: { live: true, waitingSince: null } }),
  ])
  const live = asLive(message)
  await publish('both', { type: 'message', conversationId, message: live })
  await publish('staff', { type: 'waiting', conversationId, waiting: false })
  return live
}

// What the shopper's chat window missed while closed or reconnecting: the store's and the AI's
// messages after `after` (at most 50).
export async function repliesSince(conversationId: string, after: Date | null) {
  const rows = await db.assistantMessage.findMany({
    where: { conversationId, role: { in: ['agent', 'assistant'] }, ...(after ? { createdAt: { gt: after } } : {}) },
    select: { id: true, role: true, text: true, createdAt: true, author: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  return rows.map(asLive)
}

// Admin › Live chat: chats waiting for a reply first (oldest wait first), then recent live chats.
export async function liveInbox(limit = 40) {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const rows = await db.assistantConversation.findMany({
    where: { OR: [{ waitingSince: { not: null } }, { live: true, updatedAt: { gte: since } }] },
    select: { id: true, lang: true, waitingSince: true, updatedAt: true, userId: true, messages: { select: { role: true, text: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  const userIds = [...new Set(rows.map(r => r.userId).filter((id): id is string => !!id))]
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : []
  const names = new Map(users.map(u => [u.id, u.name || u.email]))
  return rows
    .map(r => ({
      id: r.id,
      lang: r.lang,
      waitingSince: r.waitingSince?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
      customer: r.userId ? names.get(r.userId) || null : null,
      last: r.messages[0] ? { role: r.messages[0].role, text: r.messages[0].text.slice(0, 140), at: r.messages[0].createdAt.toISOString() } : null,
    }))
    .sort((a, b) => (a.waitingSince && b.waitingSince ? a.waitingSince.localeCompare(b.waitingSince) : a.waitingSince ? -1 : b.waitingSince ? 1 : b.updatedAt.localeCompare(a.updatedAt)))
}

export async function liveThread(conversationId: string) {
  const chat = await db.assistantConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, lang: true, waitingSince: true, userId: true, messages: { select: { id: true, role: true, text: true, createdAt: true, author: true }, orderBy: { createdAt: 'asc' }, take: 200 } },
  })
  if (!chat) return null
  const user = chat.userId ? await db.user.findUnique({ where: { id: chat.userId }, select: { id: true, name: true, email: true } }) : null
  return { id: chat.id, lang: chat.lang, waitingSince: chat.waitingSince?.toISOString() ?? null, customer: user ? { id: user.id, name: user.name || user.email } : null, messages: chat.messages.map(asLive) }
}

// Whether the AI should step in for this chat now: the shopper has waited at least AI_FALLBACK_MS for
// a person and nothing (person or AI) has answered since. Returns what the shopper wrote while waiting.
export async function fallbackDue(conversationId: string, now = new Date()) {
  const chat = await db.assistantConversation.findUnique({ where: { id: conversationId }, select: { waitingSince: true } })
  if (!chat?.waitingSince || now.getTime() - chat.waitingSince.getTime() < AI_FALLBACK_MS - 5_000) return null
  const since = await db.assistantMessage.findMany({ where: { conversationId, createdAt: { gte: chat.waitingSince } }, select: { role: true, text: true }, orderBy: { createdAt: 'asc' }, take: 20 })
  if (since.some(m => m.role !== 'user')) return null
  const asked = since.map(m => m.text).join('\n').slice(0, 500)
  return asked ? { asked } : null
}
