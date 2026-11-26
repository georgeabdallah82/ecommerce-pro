import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth'
import { consumeDurableRateLimit, consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { statusLabel, translator, type Lang } from '@/lib/i18n'
import { QUICK_ACTION_NAMES, WORKERS_AI_FREE_MICROS, isQuickAction, modelProvider, type ChatReply } from '@/lib/assistant/config'
import { loadAssistantConfig } from '@/lib/assistant/settings'
import { detectLanguage, pageLang } from '@/lib/assistant/language'
import { productById, toCard } from '@/lib/assistant/catalog'
import { MAX_CHAT_MESSAGES, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE, isVisitorId, newVisitorId, openConversation, recentTurns, saveTurn, visitorKeyOf } from '@/lib/assistant/chats'
import { emptyReply, quickAction, searchFallback, supportCard, trackOrderReply } from '@/lib/assistant/actions'
import { answerWithClaude, providerReady, resolveModel, spentTodayMicros } from '@/lib/assistant/engine'
import { answerWithWorkersAi, looksLikeOrderQuestion } from '@/lib/assistant/workers-ai'

// The chat widget's endpoint (components/store/assistant). POST one shopper message or button;
// the answer comes back with product cards, order links and contact buttons built from the database.
// Docs: docs/ai-assistant-2026-11.md.

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_MESSAGE = 500

async function visitor() {
  const store = await cookies()
  let id = store.get(VISITOR_COOKIE)?.value
  if (!isVisitorId(id)) {
    id = newVisitorId()
    store.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/assistant', maxAge: VISITOR_COOKIE_MAX_AGE })
  }
  return visitorKeyOf(id)
}

// Only the store's own pages may use the chat (each answer can cost money): browsers say where a
// request comes from, and a request from another site is refused.
function fromOtherSite(request: Request) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return true
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host') || new URL(request.url).host
    return new URL(origin).host !== host
  } catch { return true }
}

const cleanPage = (value: unknown) => (typeof value === 'string' && /^\/[^\s<>"]{0,200}$/.test(value) ? value : null)
const uiLang = (value: unknown): Lang => (value === 'ar' ? 'ar' : 'en')

export async function POST(request: Request) {
  const config = await loadAssistantConfig()
  if (!config.enabled) return json({ error: 'The assistant is switched off.' }, { status: 404, headers: NO_STORE })

  if (fromOtherSite(request)) return json({ error: 'Cross-site request blocked' }, { status: 403, headers: NO_STORE })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
  const ip = clientIp(request.headers)
  const page = cleanPage(body.page)
  const pageUiLang = uiLang(body.lang)

  const action = body.action
  const message = typeof body.message === 'string' ? body.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : ''
  if (action == null && !message) return json({ error: 'Type a message.' }, { status: 400, headers: NO_STORE })
  if (message.length > MAX_MESSAGE) return json({ error: `Messages can be up to ${MAX_MESSAGE} characters.` }, { status: 400, headers: NO_STORE })
  if (action != null && action !== 'track_order_form' && !isQuickAction(action)) return json({ error: 'Unknown action.' }, { status: 400, headers: NO_STORE })

  // Buttons are cheap (no AI); messages may call Claude, so they get tighter limits that survive restarts.
  if (action != null) {
    if (!consumeRateLimit(`assistant:action:${ip}`, 60, 10 * 60 * 1000).allowed) return json({ error: 'Too many requests. Please wait a moment.' }, { status: 429, headers: NO_STORE })
  }

  const [user, visitorKey] = await Promise.all([getCurrentUser().catch(() => null), visitor()])
  const userId = user?.id ?? null
  const lang = message ? detectLanguage(message) : pageUiLang === 'ar' ? 'ar' : 'en'
  const answerLang: Lang = message ? pageLang(lang) : pageUiLang
  const t = translator(answerLang)

  if (action == null) {
    const perVisitor = await consumeDurableRateLimit(`assistant:visitor:${visitorKey.slice(0, 32)}`, 15, 10 * 60 * 1000)
    const perIp = perVisitor.allowed ? await consumeDurableRateLimit(`assistant:ip:${ip}`, 60, 60 * 60 * 1000) : perVisitor
    if (!perVisitor.allowed || !perIp.allowed) {
      return json({ error: t('You are sending messages too quickly. Please wait a few minutes.') }, { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds || perVisitor.retryAfterSeconds || 60), ...NO_STORE } })
    }
  }

  const conversation = await openConversation({ conversationId: body.conversationId, visitorKey, userId, lang })
  if (conversation.messageCount >= MAX_CHAT_MESSAGES) {
    return json({ conversationId: conversation.id, reply: { ...emptyReply(t('This chat is getting long. Start a new chat to continue.')), ended: true } }, { headers: NO_STORE })
  }

  const support = { supportNote: config.supportNote, supportNoteAr: config.supportNoteAr }
  const model = resolveModel(config.model)
  let reply: ChatReply
  let saved: Parameters<typeof saveTurn>[1]

  if (action === 'track_order_form') {
    reply = await trackOrderReply({ orderNumber: body.orderNumber, contact: body.contact }, answerLang, { userId, ip })
    const number = typeof body.orderNumber === 'string' ? body.orderNumber.slice(0, 60) : ''
    saved = { userText: `[Order form] ${number}`, userKind: 'action', reply: reply.text, replyKind: 'action', productIds: [], searches: [], answered: reply.orders.length > 0, escalated: false, lang }
  } else if (action != null) {
    reply = await quickAction(action, answerLang, { userId, ...support })
    saved = { userText: `[Button] ${isQuickAction(action) ? QUICK_ACTION_NAMES[action] : action}`, userKind: 'action', reply: reply.text, replyKind: 'action', productIds: reply.products.map(p => p.id), searches: [], answered: true, escalated: action === 'support', lang }
  } else if (modelProvider(model) === 'cloudflare' && looksLikeOrderQuestion(message)) {
    // The free model gets no order data: "where is my order" opens the store's own order form.
    reply = await quickAction('track_order', answerLang, { userId, ...support })
    saved = { userText: message, userKind: 'message', reply: reply.text, replyKind: 'action', productIds: [], searches: [], answered: true, escalated: false, lang }
  } else {
    // The AI answers only while the assistant is on, the model's key is set and today's budget isn't
    // used up. Cloudflare's free model also stops at Cloudflare's free daily allowance.
    const provider = modelProvider(model)
    const budgetMicros = Math.min(Math.round(config.dailyBudgetUsd * 1_000_000), provider === 'cloudflare' ? WORKERS_AI_FREE_MICROS : Infinity)
    const canUseAi = providerReady(model) && budgetMicros > 0 && (await spentTodayMicros()) < budgetMicros
    let pageProduct: { id: string; name: string } | null = null
    const slug = page?.match(/^\/(?:ar\/)?product\/([^/?#]+)/)?.[1]
    if (slug) {
      const p = await productById(decodeURIComponent(slug)).catch(() => null)
      if (p) pageProduct = { id: p.id, name: p.name }
    }
    const history = canUseAi && !conversation.isNew ? await recentTurns(conversation.id) : []
    const result = !canUseAi ? null
      : provider === 'cloudflare' ? await answerWithWorkersAi({ model, storeName: config.storeName, history, message, lang, pageProduct })
      : await answerWithClaude({ model, storeName: config.storeName, history, message, lang, userId, ip, page, pageProduct })
    if (result?.ok) {
      reply = {
        ...emptyReply(result.text),
        products: result.products.map(toCard),
        orders: result.orderLinks.map(o => ({ orderNumber: o.orderNumber, status: statusLabel(t, o.status), placedAt: o.placedAt, link: o.link })),
        support: result.support ? await supportCard(answerLang, support) : null,
      }
      saved = { userText: message, userKind: 'message', reply: result.text, replyKind: 'ai', productIds: reply.products.map(p => p.id), searches: result.searches, answered: !result.unanswered, escalated: result.support, lang, inputTokens: result.usage.input, outputTokens: result.usage.output, costMicros: result.usage.costMicros }
    } else {
      // No AI answer: the store's own search, so the shopper still gets something useful.
      const fallback = await searchFallback(message, answerLang, support)
      reply = fallback.reply
      saved = { userText: message, userKind: 'message', reply: reply.text, replyKind: result ? 'fallback' : 'limit', productIds: reply.products.map(p => p.id), searches: [message.slice(0, 80)], answered: fallback.found, escalated: false, lang, costMicros: result && !result.ok ? result.costMicros : 0 }
    }
  }

  await saveTurn(conversation.id, saved).catch(error => console.error('[assistant] saving the chat failed', error))
  return json({ conversationId: conversation.id, reply }, { headers: NO_STORE })
}
