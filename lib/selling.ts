// Store-wide selling tools (Admin > Settings > Selling tools, and Markets for LBP): the setting
// keys and the plain rules behind them, shared by the store pages, checkout and the admin.

export const SELLING_KEYS = {
  lbpShow: 'currency.showLbp',
  lbpRate: 'currency.lbpRate',
  giftEnabled: 'freeGift.enabled',
  giftThreshold: 'freeGift.threshold',
  giftProduct: 'freeGift.productId',
  giftOption: 'checkout.giftOption',
  whatsappOrder: 'product.whatsappOrder',
  welcomeEnabled: 'welcome.enabled',
  welcomeCode: 'welcome.code',
  welcomeTitle: 'welcome.title',
  welcomeDelay: 'welcome.delaySeconds',
  searchWords: 'search.synonyms',
  // Invite a friend (lib/invites-shared.ts) and product questions (lib/product-questions.ts)
  inviteEnabled: 'invite.enabled',
  inviteFriendPercent: 'invite.friendPercent',
  inviteReward: 'invite.reward',
  inviteRewardDays: 'invite.rewardDays',
  questions: 'product.questions',
} as const

export const SELLING_SETTING_KEYS = Object.values(SELLING_KEYS)

type Settings = Record<string, string | undefined> | Map<string, string>
const read = (settings: Settings, key: string) => (settings instanceof Map ? settings.get(key) : settings[key]) ?? ''

// ---- Prices in Lebanese pounds ----
// The rate is how many LBP make $1 (e.g. 89,500). Amounts are rounded to the nearest 1,000 LBP,
// the smallest note people use.
export function lbpConfig(settings: Settings) {
  const rate = Math.round(Number(String(read(settings, SELLING_KEYS.lbpRate)).replace(/[^\d.]/g, '')) || 0)
  return { show: read(settings, SELLING_KEYS.lbpShow) === 'true' && rate > 0, rate }
}

export function lbpAmount(cents: number, rate: number) {
  if (!rate || !Number.isFinite(cents)) return 0
  return Math.round(((cents / 100) * rate) / 1000) * 1000
}

export function formatLbp(amount: number) {
  return `${Math.round(amount).toLocaleString('en-US')} LBP`
}

// ---- Free gift above an amount ----
export function freeGiftConfig(settings: Settings) {
  const threshold = Math.round(Number(read(settings, SELLING_KEYS.giftThreshold)) * 100)
  const productId = String(read(settings, SELLING_KEYS.giftProduct)).trim()
  return { enabled: read(settings, SELLING_KEYS.giftEnabled) === 'true' && threshold > 0 && !!productId, threshold: threshold > 0 ? threshold : 0, productId }
}

// How far the cart is from the gift (amounts in cents).
export function freeGiftProgress(subtotal: number, threshold: number) {
  if (!threshold) return { reached: false, remaining: 0, percent: 0 }
  const remaining = Math.max(0, threshold - subtotal)
  return { reached: remaining === 0, remaining, percent: Math.min(100, Math.round((subtotal / threshold) * 100)) }
}

// ---- Smaller switches ----
export const giftOptionOn = (settings: Settings) => read(settings, SELLING_KEYS.giftOption) !== 'false'
export const whatsappOrderOn = (settings: Settings) => read(settings, SELLING_KEYS.whatsappOrder) !== 'false'
export const questionsOn = (settings: Settings) => read(settings, SELLING_KEYS.questions) !== 'false'

export function welcomeConfig(settings: Settings) {
  const code = String(read(settings, SELLING_KEYS.welcomeCode)).trim().toUpperCase()
  const rawDelay = String(read(settings, SELLING_KEYS.welcomeDelay)).trim()
  const delay = rawDelay === '' ? NaN : Number(rawDelay)
  return {
    enabled: read(settings, SELLING_KEYS.welcomeEnabled) === 'true' && !!code,
    code,
    title: String(read(settings, SELLING_KEYS.welcomeTitle)).trim(),
    delaySeconds: Number.isFinite(delay) && delay >= 0 ? Math.min(120, Math.round(delay)) : 8,
  }
}
