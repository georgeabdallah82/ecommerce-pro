// The homepage used to render two extra bands from the separate admin "Content"
// panel (HomepageBlock rows): an announcement bar above the sections and a trust
// strip below them. They are now ordinary theme-studio sections
// (announcement_strip / trust_strip), so they can be reordered, toggled and edited
// next to everything else. This turns the old rows into those sections the first
// time the studio is opened, so nothing a store already shows is lost.

export type LegacyBlock = { id: string; type: string; title?: string | null; subtitle?: string | null; contentJson?: string | null }
type Section = { id: string; type: string; enabled?: boolean; settings?: Record<string, any>; blocks?: any[] }

export const STRIP_TYPES = ['announcement_strip', 'trust_strip']

function announcementText(block: LegacyBlock) {
  let text = block.title || ''
  try { const parsed = JSON.parse(block.contentJson || '{}'); if (parsed?.text) text = String(parsed.text) } catch { /* keep title */ }
  return text
}

export function legacyBlocksToSections(rows: LegacyBlock[]) {
  const announcements = rows.filter(row => row.type === 'announcement').map(row => ({ row, text: announcementText(row) })).filter(item => item.text)
  const trust = rows.filter(row => row.type === 'trust')
  const out: { announcement?: Section; trust?: Section } = {}
  if (announcements.length) {
    out.announcement = { id: 'announcement_strip-legacy', type: 'announcement_strip', enabled: true, settings: {}, blocks: announcements.map(({ row, text }) => ({ id: `message-${row.id}`, type: 'message', settings: { text, link: '' } })) }
  }
  if (trust.length) {
    out.trust = { id: 'trust_strip-legacy', type: 'trust_strip', enabled: true, settings: {}, blocks: trust.map(row => ({ id: `trust_item-${row.id}`, type: 'trust_item', settings: { heading: row.title || 'Why shop with us', text: row.subtitle || '' } })) }
  }
  return out
}

// Announcement strip goes where the old bar rendered (above all page content, i.e.
// right after the leading header/announcement rows); trust strip goes where the old
// strip rendered (after all content, before the footer row). A type the merchant
// already has as a section is never duplicated.
export function mergeLegacyStrips(home: Section[], rows: LegacyBlock[]) {
  const converted = legacyBlocksToSections(rows)
  const has = (type: string) => home.some(section => section.type === type)
  const next = [...home]
  let changed = false
  if (converted.announcement && !has('announcement_strip')) {
    let index = 0
    while (index < next.length && (next[index].type === 'header' || next[index].type === 'announcement')) index += 1
    next.splice(index, 0, converted.announcement)
    changed = true
  }
  if (converted.trust && !has('trust_strip')) {
    const footerIndex = next.findIndex(section => section.type === 'footer')
    next.splice(footerIndex < 0 ? next.length : footerIndex, 0, converted.trust)
    changed = true
  }
  return { sections: next, changed }
}
