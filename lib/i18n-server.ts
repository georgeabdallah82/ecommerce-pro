import { cookies, headers } from 'next/headers'
import { LANG_COOKIE, PREVIEW_COOKIE, resolveLang, translator, type Lang, type LanguageSettings } from '@/lib/i18n'

// The language of the page being rendered (lib/i18n.ts resolveLang). proxy.ts passes the path
// in x-pathname. Outside a request (emails sent in the background, scripts) it is English.
export async function requestLang(settings: LanguageSettings | null | undefined): Promise<{ lang: Lang; switchable: boolean; preview: boolean }> {
  try {
    const [h, c] = await Promise.all([headers(), cookies()])
    const path = h.get('x-pathname')
    const preview = c.get(PREVIEW_COOKIE)?.value === '1'
    const lang = resolveLang({ path, cookie: c.get(LANG_COOKIE)?.value, preview, settings })
    const storefront = !(path || '').startsWith('/admin')
    return { lang, switchable: storefront && (settings?.arabic === true || preview), preview: storefront && preview && settings?.arabic !== true }
  } catch {
    return { lang: 'en', switchable: false, preview: false }
  }
}

// For server components: the page's language (decided once, with the theme) and its translator.
export async function getLang(): Promise<Lang> {
  const { getThemeState } = await import('@/lib/theme')
  return (await getThemeState()).lang
}

export async function getT() {
  return translator(await getLang())
}
