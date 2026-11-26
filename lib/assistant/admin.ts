import { db } from '@/lib/prisma'
import { normalize } from '@/lib/smart-search'

// Admin › AI assistant: how the chat is used, what it costs, what it could not answer, and the chats
// themselves (saved without the emails and phone numbers shoppers typed; kept 90 days).

const DAY = 86_400_000

export async function assistantReport(now = new Date(), days = 30) {
  const since = new Date(now.getTime() - days * DAY)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [chats, unansweredChats, escalated, aiAnswers, actionAnswers, fallbackAnswers, costPeriod, costToday, recentSearchRows, unansweredRows] = await Promise.all([
    db.assistantConversation.count({ where: { createdAt: { gte: since } } }),
    db.assistantConversation.count({ where: { createdAt: { gte: since }, unanswered: true } }),
    db.assistantConversation.count({ where: { createdAt: { gte: since }, escalated: true } }),
    db.assistantMessage.count({ where: { createdAt: { gte: since }, role: 'assistant', kind: 'ai' } }),
    db.assistantMessage.count({ where: { createdAt: { gte: since }, role: 'assistant', kind: 'action' } }),
    db.assistantMessage.count({ where: { createdAt: { gte: since }, role: 'assistant', kind: { in: ['fallback', 'limit'] } } }),
    db.assistantMessage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costMicros: true } }),
    db.assistantMessage.aggregate({ where: { createdAt: { gte: today } }, _sum: { costMicros: true } }),
    db.assistantMessage.findMany({ where: { createdAt: { gte: since }, searchesJson: { not: null } }, select: { searchesJson: true }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    db.assistantMessage.findMany({ where: { createdAt: { gte: since }, role: 'assistant', answered: false }, select: { conversationId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])

  // What shoppers asked for, counted by the words the assistant searched with.
  const counts = new Map<string, { query: string; count: number }>()
  for (const row of recentSearchRows) {
    let list: unknown
    try { list = JSON.parse(row.searchesJson || '[]') } catch { continue }
    if (!Array.isArray(list)) continue
    for (const q of list) {
      if (typeof q !== 'string' || !q.trim()) continue
      const key = normalize(q).trim()
      if (!key) continue
      const entry = counts.get(key) || { query: q.trim(), count: 0 }
      entry.count++
      counts.set(key, entry)
    }
  }
  const topSearches = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 15)

  // The question asked just before each answer the assistant could not give.
  const unanswered = await Promise.all(unansweredRows.map(async row => {
    const asked = await db.assistantMessage.findFirst({ where: { conversationId: row.conversationId, role: 'user', createdAt: { lte: row.createdAt } }, orderBy: { createdAt: 'desc' }, select: { text: true } })
    return { conversationId: row.conversationId, question: asked?.text || '', at: row.createdAt.toISOString() }
  }))

  return {
    days,
    chats,
    unansweredChats,
    escalated,
    aiAnswers,
    actionAnswers,
    fallbackAnswers,
    costPeriodUsd: (costPeriod._sum.costMicros || 0) / 1_000_000,
    costTodayUsd: (costToday._sum.costMicros || 0) / 1_000_000,
    topSearches,
    unanswered: unanswered.filter(u => u.question && !u.question.startsWith('[')),
  }
}

// Signed-in shoppers' names, for the chat list (a chat keeps the id even if the account goes).
async function customersById(ids: Array<string | null>) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (!wanted.length) return new Map<string, { id: string; name: string }>()
  const users = await db.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true } })
  return new Map(users.map(u => [u.id, { id: u.id, name: u.name || u.email }]))
}

export const CHAT_FILTERS = ['all', 'unanswered', 'escalated'] as const
export type ChatFilter = typeof CHAT_FILTERS[number]

export async function listConversations(filter: ChatFilter, page = 1, perPage = 30) {
  const where = filter === 'unanswered' ? { unanswered: true } : filter === 'escalated' ? { escalated: true } : {}
  const [total, rows] = await Promise.all([
    db.assistantConversation.count({ where }),
    db.assistantConversation.findMany({
      where,
      select: {
        id: true, lang: true, messageCount: true, unanswered: true, escalated: true, costMicros: true, createdAt: true, updatedAt: true, userId: true,
        messages: { where: { role: 'user' }, select: { text: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (Math.max(1, page) - 1) * perPage,
      take: perPage,
    }),
  ])
  const users = await customersById(rows.map(r => r.userId))
  return {
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    rows: rows.map(r => ({
      id: r.id,
      lang: r.lang,
      messageCount: r.messageCount,
      unanswered: r.unanswered,
      escalated: r.escalated,
      costUsd: r.costMicros / 1_000_000,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      customer: r.userId ? users.get(r.userId) || null : null,
      firstMessage: r.messages[0]?.text || '',
    })),
  }
}

export async function conversationDetail(id: string) {
  const row = await db.assistantConversation.findUnique({
    where: { id },
    select: {
      id: true, lang: true, messageCount: true, unanswered: true, escalated: true, costMicros: true, createdAt: true, updatedAt: true, userId: true,
      messages: { select: { id: true, role: true, kind: true, text: true, productIdsJson: true, answered: true, costMicros: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!row) return null
  const ids = new Set<string>()
  for (const m of row.messages) {
    try { for (const id of JSON.parse(m.productIdsJson || '[]')) if (typeof id === 'string') ids.add(id) } catch { /* skip */ }
  }
  const products = ids.size ? await db.product.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, slug: true } }) : []
  const byId = new Map(products.map(p => [p.id, p]))
  const customer = row.userId ? (await customersById([row.userId])).get(row.userId) || null : null
  return {
    ...row,
    customer,
    costUsd: row.costMicros / 1_000_000,
    messages: row.messages.map(m => {
      let productIds: string[] = []
      try { productIds = JSON.parse(m.productIdsJson || '[]') } catch { /* none */ }
      return { ...m, products: productIds.map(id => byId.get(id)).filter((p): p is { id: string; name: string; slug: string } => !!p) }
    }),
  }
}
