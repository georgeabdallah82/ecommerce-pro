import { AR } from './i18n-ar'

// The storefront in English or Arabic. The owner switches the Arabic version on for customers
// in the theme editor (Theme settings > Languages); until then only someone who opened the
// Arabic preview from the editor sees it. The admin is always English.
//
// Texts in the code are written in English and looked up in lib/i18n-ar.ts; a text with no
// Arabic there stays English (tests/i18n.test.ts lists any that are missing). Texts the owner
// types (theme sections, menu items) have an optional Arabic version saved next to them,
// "<name>Ar"; customers' and legal texts are never translated automatically.

export type Lang = 'en' | 'ar'
export const LANG_COOKIE = 'lang'
// Set by the theme editor's "Preview the Arabic store" link while Arabic is still hidden.
export const PREVIEW_COOKIE = 'lang_preview'

export type LanguageSettings = { arabic?: boolean; defaultLang?: Lang }

export function isRtl(lang: Lang) { return lang === 'ar' }
// Dates in Arabic, with the same 0-9 digits as the prices.
export const dateLocale = (lang: Lang) => (lang === 'ar' ? 'ar' : undefined)

type Vars = Record<string, string | number>
function fill(text: string, vars?: Vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

export function translate(lang: Lang, text: string, vars?: Vars) {
  return fill(lang === 'ar' ? (Object.prototype.hasOwnProperty.call(AR, text) ? AR[text] : text) : text, vars)
}

export type T = (text: string, vars?: Vars) => string
// Marks an English text kept in a constant (translated later with t(text)) so tests/i18n.test.ts
// can check it has an Arabic version too.
export const markT = (text: string) => text
export const translator = (lang: Lang): T => (text, vars) => translate(lang, text, vars)

// Order and payment states as customers see them (the code values are English capitals).
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: markT('Pending'), CONFIRMED: markT('Confirmed'), PROCESSING: markT('Processing'), SHIPPED: markT('Shipped'),
  DELIVERED: markT('Delivered'), CANCELLED: markT('Cancelled'), REFUNDED: markT('Refunded'),
  UNPAID: markT('Unpaid'), PAID: markT('Paid'), FAILED: markT('Failed'), PARTIALLY_REFUNDED: markT('Partly refunded'),
  COD: markT('Cash on delivery'), CARD: markT('Card'), BANK_TRANSFER: markT('Bank transfer'), WALLET: markT('Store wallet'),
}
export const statusLabel = (t: T, value: string | null | undefined) => t(ORDER_STATUS_LABELS[String(value || '')] || String(value || ''))

// Arabic counts change the noun: 1 منتج، 2 منتجان، 3-10 منتجات، 11+ منتج. English: 1 product, 2 products.
export type Noun = 'product' | 'item' | 'order' | 'review' | 'day'
const NOUNS: Record<Noun, { en: [string, string]; ar: [string, string, string, string] }> = {
  product: { en: ['product', 'products'], ar: ['منتج واحد', 'منتجان', 'منتجات', 'منتج'] },
  item: { en: ['item', 'items'], ar: ['قطعة واحدة', 'قطعتان', 'قطع', 'قطعة'] },
  order: { en: ['order', 'orders'], ar: ['طلب واحد', 'طلبان', 'طلبات', 'طلب'] },
  review: { en: ['review', 'reviews'], ar: ['تقييم واحد', 'تقييمان', 'تقييمات', 'تقييم'] },
  day: { en: ['day', 'days'], ar: ['يوم واحد', 'يومان', 'أيام', 'يوماً'] },
}
export function countOf(lang: Lang, n: number, noun: Noun) {
  const forms = NOUNS[noun]
  if (lang !== 'ar') return `${n} ${n === 1 ? forms.en[0] : forms.en[1]}`
  if (n === 1) return forms.ar[0]
  if (n === 2) return forms.ar[1]
  const tail = n % 100
  return `${n} ${tail >= 3 && tail <= 10 ? forms.ar[2] : forms.ar[3]}`
}

// Which language this request is shown in. Admin pages are always English. Customers get the
// Arabic version only once the owner has switched it on; before that, only with the preview
// cookie the theme editor sets.
export function resolveLang(input: { path?: string | null; cookie?: string | null; preview?: boolean; settings?: LanguageSettings | null }): Lang {
  const path = input.path || '/'
  if (path.startsWith('/admin') || path.startsWith('/api/admin')) return 'en'
  const enabled = input.settings?.arabic === true || input.preview === true
  if (!enabled) return 'en'
  if (input.cookie === 'ar' || input.cookie === 'en') return input.cookie
  return input.settings?.arabic === true && input.settings?.defaultLang === 'ar' ? 'ar' : 'en'
}

// Owner-typed texts: the Arabic version saved next to a text ("headingAr" beside "heading",
// "areasAr" beside the delivery areas) replaces it; a text left as one of the store's own
// defaults ("Shop now", "Best sellers") gets its Arabic from the dictionary; anything else
// stays as typed. The dictionary is only tried on text-like keys, never links, colours or ids.
const TEXT_KEY = /(label|heading|title|text|subheading|subtitle|eyebrow|tag|highlight|kicker|note|caption|description|placeholder|badge|quote|author|role|question|answer|message|cta|name|value)$/i
const NOT_TEXT_KEY = /(url|link|href|image|img|icon|color|colour|id|type|font|style|align|position|mode|slug|handle|key|email|phone|number|areas|design|preset)$/i
export function isTranslatableKey(key: string) { return TEXT_KEY.test(key) && !NOT_TEXT_KEY.test(key) && !key.endsWith('Ar') }

export function localize<T>(value: T, lang: Lang): T {
  if (lang !== 'ar') return value
  const walk = (node: any): any => {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== 'object') return node
    const out: Record<string, any> = {}
    for (const [key, child] of Object.entries(node)) {
      const own = typeof child === 'string' && !key.endsWith('Ar') ? node[`${key}Ar`] : undefined
      if (typeof own === 'string' && own.trim()) out[key] = own
      else if (typeof child === 'string' && isTranslatableKey(key)) out[key] = translate('ar', child)
      else out[key] = walk(child)
    }
    // An Arabic text typed while the English box was left empty (the English then shows its standard text):
    // it used to be skipped, because only keys that had an English value looked for an Arabic one.
    for (const [key, own] of Object.entries(node)) {
      if (!key.endsWith('Ar') || typeof own !== 'string' || !own.trim()) continue
      const base = key.slice(0, -2)
      if (!base) continue
      const english = node[base]
      if (english === undefined || english === null || (typeof english === 'string' && !english.trim())) out[base] = own
    }
    return out
  }
  return walk(value)
}
