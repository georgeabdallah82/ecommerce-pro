'use client'

import { createContext, useContext, useMemo } from 'react'
import { LANG_COOKIE, countOf, translator, type Lang, type Noun, type T } from '@/lib/i18n'

type I18n = { lang: Lang; t: T; count: (n: number, noun: Noun) => string; dir: 'rtl' | 'ltr'; switchable: boolean; preview: boolean }
const I18nContext = createContext<I18n>({ lang: 'en', t: translator('en'), count: (n, noun) => countOf('en', n, noun), dir: 'ltr', switchable: false, preview: false })

// The storefront's language for client components, set by app/layout.tsx (and by the theme
// editor's preview frame for the language being edited). `switchable`: the owner has switched
// the Arabic version on, or this visitor opened the editor's Arabic preview (`preview`).
export function LangProvider({ lang, switchable = false, preview = false, children }: { lang: Lang; switchable?: boolean; preview?: boolean; children: React.ReactNode }) {
  const value = useMemo<I18n>(() => ({ lang, t: translator(lang), count: (n, noun) => countOf(lang, n, noun), dir: lang === 'ar' ? 'rtl' : 'ltr', switchable, preview }), [lang, switchable, preview])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() { return useContext(I18nContext) }

// Remembered for a year; the page reloads so everything (server parts included) is redrawn.
export function setLanguage(lang: Lang) {
  try { document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax` } catch {}
  window.location.reload()
}

// "English" / "العربية" in the header and the phone menu, only when Arabic can be shown.
export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, switchable, preview } = useI18n()
  if (!switchable) return null
  const next: Lang = lang === 'ar' ? 'en' : 'ar'
  return <button type="button" className={className || 'langSwitch'} lang={next} onClick={() => setLanguage(next)} title={preview ? 'Preview: customers do not see the Arabic version yet' : undefined}>
    {next === 'ar' ? 'العربية' : 'English'}{preview ? ' (preview)' : ''}
  </button>
}
