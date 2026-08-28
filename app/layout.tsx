import './globals.css'
import './focal-store.css'
import './focal-store-v2.css'
import './focal-animations.css'
import './focal-nav-enhancements.css'
import './responsive-fixes.css'
import './shopify-polish.css'
import './ui-polish.css'
import './ui-polish-v2.css'
import './production-polish.css'
import './storefront-ux-v3.css'
import './storefront-ux-v3b.css'
import './storefront-ux-v4.css'
import './storefront-ux-v4b.css'
import './storefront-nav-ux-v5.css'
import './storefront-nav-ux-v6.css'
import './storefront-nav-ux-v7.css'
import { getThemeState } from '@/lib/theme'
import StoreNavRuntime from '@/components/store-nav-runtime'
import StoreNavScroll from '@/components/store-nav-scroll'
import { CartProvider } from '@/components/cart-provider'
import type { Metadata, Viewport } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const brand = process.env.NEXT_PUBLIC_BRAND_NAME || 'Your Brand'
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

export const metadata: Metadata = {
  title: { default: brand, template: `%s | ${brand}` },
  description: `Shop ${brand} online.`,
  metadataBase: new URL(siteUrl),
  robots: { index: true, follow: true },
}

const readableFontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme, navigation } = await getThemeState()
  const vars = {
    '--store-bg': theme.colors.background,
    '--store-surface': theme.colors.surface,
    '--store-text': theme.colors.text,
    '--store-muted': theme.colors.muted,
    '--store-primary': theme.colors.primary,
    '--store-button-text': theme.colors.buttonText,
    '--store-border': theme.colors.border,
    '--store-max': `${theme.layout.maxWidth}px`,
    '--store-section-space': `${theme.layout.sectionSpacing}px`,
    '--store-card-radius': `${theme.cards.radius}px`,
    '--store-button-radius': `${theme.buttons.radius}px`,
    '--store-font-heading': readableFontStack,
    '--store-font-body': readableFontStack,
    '--store-animation-duration': `${theme.animations?.duration || 420}ms`,
    '--store-animation-easing': theme.animations?.easing || 'cubic-bezier(.22,.8,.26,1)',
    '--store-btn-style': theme.buttons?.style || 'solid',
    '--store-btn-hover': theme.buttons?.hover || 'lift',
    '--store-header-logo-width': `${theme.header?.logoWidth || 160}px`,
  } as React.CSSProperties
  return <html lang="en"><head><link rel="stylesheet" href="/theme-fallback.css?v=10"/>{theme.faviconUrl && <link rel="icon" href={theme.faviconUrl}/>} {theme.customCss && <style dangerouslySetInnerHTML={{ __html: theme.customCss }}/>}</head><body style={vars} className={theme.animations?.enabled ? 'animations-enabled' : ''}><CartProvider><StoreNavRuntime theme={theme} navigation={navigation}/><StoreNavScroll/>{children}</CartProvider></body></html>
}