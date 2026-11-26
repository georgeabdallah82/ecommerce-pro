// The AI shopping assistant's settings (Admin › AI assistant), with no server imports: shared by the
// admin page, the chat widget and the tests. Stored as Setting rows under "assistant.*"; read with
// loadAssistantConfig (lib/assistant/settings.ts). Docs: docs/ai-assistant-2026-11.md.

// Buttons that are answered from the store's own data, with no Claude call (lib/assistant/actions.ts).
export const QUICK_ACTIONS = ['find_product', 'best_sellers', 'new_arrivals', 'track_order', 'delivery_info', 'support'] as const
export type QuickAction = typeof QUICK_ACTIONS[number]
// How a button press is written in the saved chat (Admin › AI assistant › Conversations).
export const QUICK_ACTION_NAMES: Record<QuickAction, string> = {
  find_product: 'Find a product', best_sellers: 'Best sellers', new_arrivals: 'New arrivals',
  track_order: 'Track my order', delivery_info: 'Delivery information', support: 'Talk to support',
}
export const isQuickAction = (value: unknown): value is QuickAction => typeof value === 'string' && (QUICK_ACTIONS as readonly string[]).includes(value)

export type AssistantSuggestion = { label: string; labelAr: string; action?: QuickAction; message?: string }

// The Claude models the owner can pick, with Anthropic's list prices in dollars per million tokens
// (cache writes cost 1.25x the input price). Used to estimate each answer's cost for the daily cap.
export const ASSISTANT_MODELS = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5 (best answers)', input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5 (balanced)', input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5 (lowest cost)', input: 0.1, output: 0.5, cacheRead: 0.01 },
} as const
export type AssistantModel = keyof typeof ASSISTANT_MODELS
export const DEFAULT_MODEL: AssistantModel = 'claude-opus-5-5'
export const isAssistantModel = (value: unknown): value is AssistantModel => typeof value === 'string' && value in ASSISTANT_MODELS

export type AssistantUsage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

// Millionths of a dollar for one response's usage.
export function costMicros(model: string, usage: AssistantUsage) {
  const price = ASSISTANT_MODELS[isAssistantModel(model) ? model : DEFAULT_MODEL]
  const n = (v: number | null | undefined) => Math.max(0, Number(v) || 0)
  return Math.ceil(n(usage.input_tokens) * price.input + n(usage.output_tokens) * price.output + n(usage.cache_read_input_tokens) * price.cacheRead + n(usage.cache_creation_input_tokens) * price.input * 1.25)
}

export type AssistantConfig = {
  enabled: boolean
  welcome: string
  welcomeAr: string
  suggestions: AssistantSuggestion[]
  // Claude answers stop for the day once their estimated cost reaches this; quick actions keep working.
  dailyBudgetUsd: number
  model: AssistantModel
  // Shown when the assistant can't help, next to the store's WhatsApp and email.
  supportNote: string
  supportNoteAr: string
}

// "{store}" becomes the store's name.
export const DEFAULT_CONFIG: AssistantConfig = {
  enabled: false,
  welcome: "Hey! Welcome to {store} \u{1F44B}\nI'm your shopping assistant. Looking for something special today?",
  welcomeAr: 'أهلاً وسهلاً في {store}! \u{1F44B}\nكيف فيني ساعدك تلاقي الشي اللي عم تدوّر عليه؟',
  suggestions: [
    { label: 'Find a product', labelAr: 'دوّر على منتج', action: 'find_product' },
    { label: 'Best sellers', labelAr: 'الأكثر مبيعاً', action: 'best_sellers' },
    { label: 'New arrivals', labelAr: 'وصل حديثاً', action: 'new_arrivals' },
    { label: 'Track my order', labelAr: 'تتبّع طلبي', action: 'track_order' },
    { label: 'Delivery information', labelAr: 'معلومات التوصيل', action: 'delivery_info' },
    { label: 'Talk to support', labelAr: 'حكي مع الدعم', action: 'support' },
  ],
  dailyBudgetUsd: 1,
  model: DEFAULT_MODEL,
  supportNote: '',
  supportNoteAr: '',
}

export const SETTING_KEYS = {
  enabled: 'assistant.enabled',
  welcome: 'assistant.welcome',
  welcomeAr: 'assistant.welcomeAr',
  suggestions: 'assistant.suggestions',
  dailyBudgetUsd: 'assistant.dailyBudgetUsd',
  model: 'assistant.model',
  supportNote: 'assistant.supportNote',
  supportNoteAr: 'assistant.supportNoteAr',
} as const

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)

// Cleans suggestions from the admin form or the stored setting: at most 8, each with a label and
// either a quick action or a question to send.
export function cleanSuggestions(value: unknown): AssistantSuggestion[] {
  if (!Array.isArray(value)) return DEFAULT_CONFIG.suggestions
  const out: AssistantSuggestion[] = []
  for (const raw of value.slice(0, 8)) {
    const label = text(raw?.label, 40)
    const labelAr = text(raw?.labelAr, 40)
    const action = isQuickAction(raw?.action) ? raw.action : undefined
    const message = action ? undefined : text(raw?.message, 200)
    if (!label || (!action && !message)) continue
    out.push({ label, labelAr: labelAr || label, ...(action ? { action } : { message }) })
  }
  return out
}

// The stored settings (key -> value) over the defaults.
export function parseAssistantConfig(map: Map<string, string>): AssistantConfig {
  const get = (key: string) => map.get(key)
  let suggestions = DEFAULT_CONFIG.suggestions
  try { const raw = get(SETTING_KEYS.suggestions); if (raw) suggestions = cleanSuggestions(JSON.parse(raw)) } catch { /* keep the defaults */ }
  const budget = Number(get(SETTING_KEYS.dailyBudgetUsd))
  const model = get(SETTING_KEYS.model)
  return {
    enabled: get(SETTING_KEYS.enabled) === 'true',
    welcome: text(get(SETTING_KEYS.welcome), 400) || DEFAULT_CONFIG.welcome,
    welcomeAr: text(get(SETTING_KEYS.welcomeAr), 400) || DEFAULT_CONFIG.welcomeAr,
    suggestions,
    dailyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? Math.min(budget, 100) : DEFAULT_CONFIG.dailyBudgetUsd,
    model: isAssistantModel(model) ? model : DEFAULT_CONFIG.model,
    supportNote: text(get(SETTING_KEYS.supportNote), 300),
    supportNoteAr: text(get(SETTING_KEYS.supportNoteAr), 300),
  }
}

export const withStoreName = (message: string, store: string) => message.replaceAll('{store}', store)

// One answer as the chat widget shows it. Products, order links and contact buttons are built on
// the server from the database, never from Claude's text.
export type ChatCard = { id: string; name: string; url: string; image: string | null; price: number; compareAtPrice: number | null; stock: 'in_stock' | 'out_of_stock' | 'preorder'; summary: string }
export type ChatReply = {
  text: string
  products: ChatCard[]
  orders: Array<{ orderNumber: string; status: string; placedAt: string; link: string | null }>
  support: { whatsapp: string; email: string; note: string } | null
  // Show the order number + phone/email form under this answer.
  form: 'track_order' | null
  // The chat reached its length limit: the widget offers a new chat.
  ended?: boolean
}
