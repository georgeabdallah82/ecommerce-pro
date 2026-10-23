import { Inter, Space_Grotesk, Archivo, Manrope, Sora, DM_Sans, Poppins, Bricolage_Grotesque, Libre_Caslon_Text, Work_Sans } from 'next/font/google'

export { FONT_OPTIONS, fontCssStack } from '@/lib/font-options'

// Server-only: next/font/google's loader calls must run at module scope in
// code that reaches the server/build compiler (app/layout.tsx is the only
// importer of FONT_VARIABLE_CLASSES). A curated allowlist, not an open text
// field -- admins pick a font by key (see FONT_OPTIONS in lib/font-options.ts)
// from this list, never type an arbitrary family name. Every font we want to
// offer needs its own static import here; each becomes a CSS variable applied
// globally via FONT_VARIABLE_CLASSES on <html>, and app/layout.tsx picks
// which variable to point --store-font-heading/body at based on the theme's
// typography.heading/body key.
// Only the store's default font (DM Sans) is preloaded: every preloaded family is downloaded on every
// page, and ten of them were ~360 KB on every first visit. The others still work when chosen in the
// theme editor; the browser fetches a family only when text on the page actually uses it.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap', preload: false })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap', preload: false })
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap', preload: false })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap', preload: false })
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap', preload: false })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-poppins', display: 'swap', preload: false })
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap', preload: false })
const libreCaslonText = Libre_Caslon_Text({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-libre-caslon-text', display: 'swap', preload: false })
const workSans = Work_Sans({ subsets: ['latin'], variable: '--font-work-sans', display: 'swap', preload: false })

export const FONT_VARIABLE_CLASSES = [inter, spaceGrotesk, archivo, manrope, sora, dmSans, poppins, bricolage, libreCaslonText, workSans]
  .map(f => f.variable)
  .join(' ')
