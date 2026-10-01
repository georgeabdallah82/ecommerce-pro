// Custom pages (Online Store > Pages) can be built from the same sections as the
// homepage. Their sections live in the theme's editorTemplates under one key per page --
// keyed by page id, so renaming a page's handle never orphans its design -- which means
// they get drafts, publishing and version history through the existing theme flow with
// no database change.
export const PAGE_KEY_PREFIX = 'Page:'
export const pageTemplateKey = (pageId: string) => `${PAGE_KEY_PREFIX}${pageId}`
export const isPageTemplateKey = (key: string) => key.startsWith(PAGE_KEY_PREFIX)
export const pageIdFromKey = (key: string) => key.slice(PAGE_KEY_PREFIX.length)

// Structural entries that are never page content (the nav and footer render themselves).
const NOT_CONTENT = new Set(['header', 'announcement', 'footer', 'main_product', 'main_collection_banner', 'main_collection_grid'])

export function pageSections(theme: { editorTemplates?: Record<string, any[]> } | null | undefined, pageId: string) {
  const list = theme?.editorTemplates?.[pageTemplateKey(pageId)]
  return (Array.isArray(list) ? list : []).filter(section => section && !NOT_CONTENT.has(section.type))
}

// Plain-text pages (just a title and body) look exactly as they always did. A page built
// from sections only shows its title/body block when it actually has body content, so a
// landing page can open straight on a banner instead of a bare heading.
export function showPageHeader(page: { bodyHtml?: string | null }, sectionCount: number) {
  return sectionCount === 0 || Boolean(page.bodyHtml && page.bodyHtml.trim())
}
