// Plain data, safe to import from both server and client code -- unlike
// lib/fonts.ts, this file never calls next/font/google, so importing it
// doesn't pull font-loader build machinery into a client bundle. The actual
// --font-x custom properties this references are made available globally by
// app/layout.tsx (the only place next/font/google is actually invoked),
// applied via FONT_VARIABLE_CLASSES on <html> -- every route under the root
// layout, including the theme-editor's iframe preview, already has them.
export const FONT_OPTIONS: Array<{ key: string; label: string; cssVar: string; category: 'sans' | 'serif' }> = [
  { key: 'inter', label: 'Inter', cssVar: 'var(--font-inter)', category: 'sans' },
  { key: 'spaceGrotesk', label: 'Space Grotesk', cssVar: 'var(--font-space-grotesk)', category: 'sans' },
  { key: 'archivo', label: 'Archivo', cssVar: 'var(--font-archivo)', category: 'sans' },
  { key: 'manrope', label: 'Manrope', cssVar: 'var(--font-manrope)', category: 'sans' },
  { key: 'sora', label: 'Sora', cssVar: 'var(--font-sora)', category: 'sans' },
  { key: 'dmSans', label: 'DM Sans', cssVar: 'var(--font-dm-sans)', category: 'sans' },
  { key: 'poppins', label: 'Poppins', cssVar: 'var(--font-poppins)', category: 'sans' },
  { key: 'bricolage', label: 'Bricolage Grotesque', cssVar: 'var(--font-bricolage)', category: 'sans' },
  { key: 'libreCaslonText', label: 'Libre Caslon Text', cssVar: 'var(--font-libre-caslon-text)', category: 'serif' },
  { key: 'workSans', label: 'Work Sans', cssVar: 'var(--font-work-sans)', category: 'sans' },
]

const FALLBACK_STACK: Record<'sans' | 'serif', string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
}

export function fontCssStack(key: string | undefined): string {
  const match = FONT_OPTIONS.find(f => f.key === key) || FONT_OPTIONS[0]
  return `${match.cssVar}, ${FALLBACK_STACK[match.category]}`
}
