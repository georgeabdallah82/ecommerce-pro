// A section's own background and text colour, set in the theme studio (section > Design).
// Empty means the theme's normal look. When only the background is chosen, the text turns
// white or near-black, whichever reads better on it, so a dark band never hides its heading.

// Sections drawn somewhere else (header, footer, the announcement bar) or covered by their
// own photo or colours (heroes, the announcement strip) have nothing here to colour.
export const NO_SECTION_COLORS = new Set(['header', 'footer', 'announcement', 'announcement_strip', 'hero', 'hero_slider', 'slideshow'])

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value.trim())

function rgb(hex: string) {
  let h = hex.trim().slice(1)
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
// WCAG contrast ratio, 1 (none) to 21 (black on white).
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
export const INK = '#171717'
export function readableTextOn(background: string) {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, INK) ? '#ffffff' : INK
}

export function sectionColors(type: string, settings: Record<string, any> | null | undefined): { background?: string; color?: string } | null {
  if (NO_SECTION_COLORS.has(type)) return null
  const bg = isHexColor(settings?.sectionBg) ? settings!.sectionBg.trim() : ''
  const fg = isHexColor(settings?.sectionText) ? settings!.sectionText.trim() : ''
  if (!bg && !fg) return null
  return { ...(bg ? { background: bg } : {}), color: fg || readableTextOn(bg) }
}
