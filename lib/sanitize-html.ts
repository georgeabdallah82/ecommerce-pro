import { FilterXSS, escapeAttrValue, getDefaultWhiteList } from 'xss'

// Rich text written in the admin (custom pages, blog posts) is rendered with
// dangerouslySetInnerHTML on the storefront. Staff accounts with content permissions
// could otherwise store a <script> or onerror= handler that runs in the store's origin
// for every visitor -- including a super admin, whose session it would then act as.
// Allowlist-based: formatting, links, images, tables and video embeds survive;
// scripts, event handlers, javascript: URLs and forms do not.
const VIDEO_EMBED = /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/i

const whiteList = {
  ...getDefaultWhiteList(),
  iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder'],
}

const filter = new FilterXSS({
  whiteList,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'noscript', 'template'],
  onTagAttr(tag, name, value) {
    if (tag === 'iframe' && name === 'src' && !VIDEO_EMBED.test(value)) return ''
    return undefined
  },
  onIgnoreTagAttr(_tag, name, value) {
    // Class names are harmless and let merchants use the theme's typography helpers.
    if (name === 'class') return `class="${escapeAttrValue(value)}"`
    return undefined
  },
})

export function sanitizeRichHtml(html: unknown): string {
  return filter.process(String(html ?? ''))
}

// Theme "Custom CSS" goes inside a <style> element; a literal "</style>" in it would end
// the element and let the rest be parsed as HTML. "<" never needs to appear unescaped in
// CSS, so it's written as the CSS escape \3c instead.
export function safeStyleText(css: unknown): string {
  return String(css ?? '').replace(/</g, '\\3c ')
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Product descriptions are typed in a plain text box, but CSV imports (Shopify's "Body (HTML)")
// and copy-paste bring HTML. HTML is kept (sanitized); plain text keeps its paragraphs and
// line breaks instead of collapsing into one block.
export function descriptionHtml(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/<\/?(p|br|div|span|ul|ol|li|h[1-6]|strong|b|em|i|u|a|table|img|blockquote)\b[^>]*>/i.test(text)) return sanitizeRichHtml(text)
  return text.split(/\r?\n\s*\r?\n/).map(p => `<p>${escapeText(p.trim()).replace(/\r?\n/g, '<br>')}</p>`).join('')
}
