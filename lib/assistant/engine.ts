import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/prisma'
import { ASSISTANT_MODELS, costMicros, isAssistantModel, modelProvider, type AssistantModel } from './config'
import { workersAiConfigured } from './workers-ai'
import type { ChatLang } from './language'
import { readMarkers, shopperTurn, systemPrompt } from './prompt'
import { TOOLS, runTool, type ToolContext } from './tools'
import type { CatalogProduct } from './catalog'

// One Claude answer: the shopper's message plus the chat so far, with the store's tools, at most a
// few tool rounds. Costs are counted per answer and summed per day for the owner's daily cap.
// The key is the ANTHROPIC_API_KEY secret (Cloudflare: wrangler secret put ANTHROPIC_API_KEY).

const MAX_ROUNDS = 4
const MAX_TOKENS = 1500
const TIMEOUT_MS = 30_000

export const assistantKeyConfigured = () => !!process.env.ANTHROPIC_API_KEY

// Whether the chosen model can answer: Claude needs ANTHROPIC_API_KEY; Cloudflare's free model needs
// CLOUDFLARE_AI_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.
export function providerReady(model: AssistantModel) {
  return modelProvider(model) === 'cloudflare' ? workersAiConfigured() : assistantKeyConfigured()
}

let client: Anthropic | null = null
function anthropic() {
  // ANTHROPIC_BASE_URL is read by the SDK too; it is only set for local tests with a stand-in server.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 1 })
  return client
}

// The model: Admin › AI assistant, or ASSISTANT_MODEL to override it on the server.
export function resolveModel(configured: AssistantModel): AssistantModel {
  const env = process.env.ASSISTANT_MODEL
  return isAssistantModel(env) ? env : configured
}

// Today's estimated spend (UTC day), in millionths of a dollar.
export async function spentTodayMicros(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const sum = await db.assistantMessage.aggregate({ where: { createdAt: { gte: start } }, _sum: { costMicros: true } })
  return sum._sum.costMicros || 0
}

export type HistoryTurn = { role: 'user' | 'assistant'; text: string }

export type EngineResult =
  | { ok: true; text: string; products: CatalogProduct[]; support: boolean; unanswered: boolean; orderLinks: ToolContext['orderLinks']; searches: string[]; usage: { input: number; output: number; costMicros: number } }
  | { ok: false; reason: 'refused' | 'failed'; costMicros: number }

export async function answerWithClaude(input: {
  model: AssistantModel
  storeName: string
  history: HistoryTurn[]
  message: string
  lang: ChatLang
  userId: string | null
  ip: string
  page?: string | null
  pageProduct?: { id: string; name: string } | null
}): Promise<EngineResult> {
  const model = input.model
  const ctx: ToolContext = { userId: input.userId, ip: input.ip, seen: new Map(), searches: [], orderLinks: [] }
  const messages: Anthropic.MessageParam[] = []
  // Earlier turns as plain text; the API wants the chat to start with the shopper and alternate.
  for (const turn of input.history) {
    const last = messages[messages.length - 1]
    if (!messages.length && turn.role !== 'user') continue
    if (last && last.role === turn.role) { last.content = `${last.content}\n\n${turn.text}`; continue }
    messages.push({ role: turn.role, content: turn.text })
  }
  if (messages.length && messages[messages.length - 1].role === 'user') messages.pop()
  messages.push({ role: 'user', content: shopperTurn(input.message, { lang: input.lang, signedIn: !!input.userId, page: input.page, pageProduct: input.pageProduct }) })

  let cost = 0
  let tokensIn = 0
  let tokensOut = 0
  try {
    for (let round = 0; round < MAX_ROUNDS + 1; round++) {
      const lastRound = round === MAX_ROUNDS
      const response = await anthropic().messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt(input.storeName), cache_control: { type: 'ephemeral' } }],
        // On the last round the tools are still described (the chat holds tool calls) but the
        // answer must be text: Claude is told so in the follow-up turn.
        tools: TOOLS,
        ...(model === 'claude-haiku-5-5' ? {} : { output_config: { effort: 'low' as const } }),
        messages,
      })
      cost += costMicros(model, response.usage)
      tokensIn += (response.usage.input_tokens || 0) + (response.usage.cache_read_input_tokens || 0) + (response.usage.cache_creation_input_tokens || 0)
      tokensOut += response.usage.output_tokens || 0

      if (response.stop_reason === 'refusal') return { ok: false, reason: 'refused', costMicros: cost }
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content })
        continue
      }
      if (response.stop_reason === 'tool_use' && !lastRound) {
        // The whole reply goes back (thinking included), then every tool result in one turn.
        messages.push({ role: 'assistant', content: response.content })
        const results: Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam> = []
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue
          let content: string
          let isError = false
          try {
            content = JSON.stringify(await runTool(block.name, (block.input || {}) as Record<string, unknown>, ctx))
          } catch (error) {
            console.error('[assistant] tool failed', block.name, error)
            content = JSON.stringify({ error: 'This information is not available right now.' })
            isError = true
          }
          results.push({ type: 'tool_result', tool_use_id: block.id, content, ...(isError ? { is_error: true } : {}) })
        }
        if (round + 1 === MAX_ROUNDS) results.push({ type: 'text', text: 'Answer the shopper now with what you have; no more tool calls.' })
        messages.push({ role: 'user', content: results })
        continue
      }
      const raw = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
      if (!raw) return { ok: false, reason: 'failed', costMicros: cost }
      const marked = readMarkers(raw)
      // Cards only for products a tool returned in this answer, as the database has them now.
      const products = marked.productIds.map(id => ctx.seen.get(id)).filter((p): p is CatalogProduct => !!p)
      return { ok: true, text: marked.text, products, support: marked.support, unanswered: marked.unanswered, orderLinks: ctx.orderLinks, searches: ctx.searches, usage: { input: tokensIn, output: tokensOut, costMicros: cost } }
    }
    return { ok: false, reason: 'failed', costMicros: cost }
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status : undefined
    console.error('[assistant] Claude call failed', status ?? '', error instanceof Error ? error.message : error)
    return { ok: false, reason: 'failed', costMicros: cost }
  }
}

export const modelLabel = (model: string) => (isAssistantModel(model) ? ASSISTANT_MODELS[model].label : model)
