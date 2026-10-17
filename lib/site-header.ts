// The announcement bar and the header are the same on every page. Theme Studio edits them in
// the Home page list ("Header -- Whole site"), so every page shows that one copy. The other page
// templates (Product, Collection, Cart...) still carry old copies of their own from when they
// were created; those are never shown (they used to be, so a product page kept an old text).

export const SITE_HEADER_TEMPLATE = 'Home page'

export const isSiteHeaderSection = (section: any) => section?.type === 'header' || section?.type === 'announcement'

export function siteHeaderSections(templates: Record<string, any[]> | null | undefined): any[] {
  const list = templates?.[SITE_HEADER_TEMPLATE]
  return Array.isArray(list) ? list.filter(isSiteHeaderSection) : []
}
