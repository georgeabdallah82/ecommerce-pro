// The full per-page section templates of a published theme, kept beside the theme object
// instead of on it. Pages pass `theme` into client components, and React serializes every
// property of it into the page HTML; the templates (every page's sections) are only needed on
// the server. A hidden (non-enumerable) property did keep them out, but React's dev checks
// reject such objects ("Only plain objects can be passed to Client Components").
const store = new WeakMap<object, Record<string, any[]>>()

export function setThemeTemplates(theme: object, templates: Record<string, any[]>) {
  store.set(theme, templates)
}

/** A theme's page templates: from getThemeState(), or a draft theme that still carries them. */
export function themeTemplates(theme: any): Record<string, any[]> {
  return (theme && typeof theme === 'object' && store.get(theme)) || theme?.editorTemplates || {}
}
