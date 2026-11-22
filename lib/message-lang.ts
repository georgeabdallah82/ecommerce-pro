import { db } from '@/lib/prisma'
import { requestLang } from '@/lib/i18n-server'
import type { Lang, LanguageSettings } from '@/lib/i18n'
import { getStorefrontSettings } from '@/lib/storefront-settings'

// The language of the emails and WhatsApp messages a customer gets (docs/arabic-messages-2026-11.md).
//
// - Kept when the shopper acts: an order, a cart left at checkout and a "notify me when it's back" request keep the
//   language the shopper was using (Order.lang, AbandonedCheckout.lang, BackInStockRequest.lang). Sign-up and
//   "forgot password" emails go out at once, in the language of the page they were sent from.
// - A record with none (from before, or typed in by staff) gets the customer's language from their latest order
//   that has one, else the store's default language.
// - The store's default is Arabic only when the owner switched the Arabic store on and made it the default
//   (Theme settings > Languages); otherwise English.

export const messageLang = (value: unknown): Lang | null => (value === 'ar' || value === 'en' ? value : null)

async function languageSettings(): Promise<LanguageSettings | null> {
  try {
    const theme = JSON.parse((await getStorefrontSettings()).get('theme.config') || '{}')
    return theme && typeof theme.languages === 'object' ? theme.languages : null
  } catch {
    return null
  }
}

export const defaultLangOf = (languages: LanguageSettings | null | undefined): Lang => (languages?.arabic === true && languages?.defaultLang === 'ar' ? 'ar' : 'en')

export async function storeDefaultLang(): Promise<Lang> {
  return defaultLangOf(await languageSettings())
}

// The language of the shopper making this request (checkout, sign-up, "notify me"): the one their pages are shown
// in (lib/i18n.ts resolveLang), so Arabic only once the owner switched it on, or in the owner's Arabic preview.
export async function shopperLang(): Promise<Lang> {
  try {
    return (await requestLang(await languageSettings())).lang
  } catch {
    return 'en'
  }
}

// A customer known by account or email, without a language at hand: their latest order's language.
export async function customerLang(who: { userId?: string | null; email?: string | null }): Promise<Lang> {
  const email = String(who.email || '').trim().toLowerCase()
  const or = [...(who.userId ? [{ userId: who.userId }] : []), ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : [])]
  if (or.length) {
    const latest = await db.order.findFirst({ where: { OR: or, lang: { not: null } }, orderBy: { createdAt: 'desc' }, select: { lang: true } }).catch(() => null)
    const lang = messageLang(latest?.lang)
    if (lang) return lang
  }
  return storeDefaultLang()
}

// For an order, a cart or a request: its own language, else the customer's, else the store's default.
export async function langFor(record: { lang?: string | null; userId?: string | null; email?: string | null }): Promise<Lang> {
  return messageLang(record.lang) ?? customerLang(record)
}
