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
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' })
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-poppins', display: 'swap' })
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' })
const libreCaslonText = Libre_Caslon_Text({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-libre-caslon-text', display: 'swap' })
const workSans = Work_Sans({ subsets: ['latin'], variable: '--font-work-sans', display: 'swap' })

export const FONT_VARIABLE_CLASSES = [inter, spaceGrotesk, archivo, manrope, sora, dmSans, poppins, bricolage, libreCaslonText, workSans]
  .map(f => f.variable)
  .join(' ')
