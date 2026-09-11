// Plain data, safe to import from both server and client code -- unlike
// lib/fonts.ts, this file never calls next/font/google, so importing it
// doesn't pull font-loader build machinery into a client bundle. The actual
// --font-x custom properties this references are made available globally by
// app/layout.tsx (the only place next/font/google is actually invoked),
// applied via FONT_VARIABLE_CLASSES on <html> -- every route under the root
// layout, including the theme-editor's iframe preview, already has them.
export const FONT_OPTIONS: Array<{ key: string; label: string; cssVar: string }> = [
  { key: 'inter', label: 'Inter', cssVar: 'var(--font-inter)' },
  { key: 'spaceGrotesk', label: 'Space Grotesk', cssVar: 'var(--font-space-grotesk)' },
  { key: 'archivo', label: 'Archivo', cssVar: 'var(--font-archivo)' },
  { key: 'manrope', label: 'Manrope', cssVar: 'var(--font-manrope)' },
  { key: 'sora', label: 'Sora', cssVar: 'var(--font-sora)' },
  { key: 'dmSans', label: 'DM Sans', cssVar: 'var(--font-dm-sans)' },
  { key: 'poppins', label: 'Poppins', cssVar: 'var(--font-poppins)' },
  { key: 'bricolage', label: 'Bricolage Grotesque', cssVar: 'var(--font-bricolage)' },
]

export function fontCssStack(key: string | undefined): string {
  const match = FONT_OPTIONS.find(f => f.key === key)
  return `${(match || FONT_OPTIONS[0]).cssVar}, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
}
