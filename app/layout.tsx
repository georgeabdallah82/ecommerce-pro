import './globals.css'
import './storefront-legacy.css'
import { headers } from 'next/headers'
import { db } from '@/lib/prisma'
import { getThemeState, defaultTheme, defaultNavigation } from '@/lib/theme'
import { getTrackingConfig } from '@/lib/tracking'
import { FONT_VARIABLE_CLASSES } from '@/lib/fonts'
import { fontCssStack } from '@/lib/font-options'
import StoreNavRuntime from '@/components/store-nav-runtime'
import StoreNavScroll from '@/components/store-nav-scroll'
import LiveVisitorTracker from '@/components/live-visitor-tracker'
import { CartProvider } from '@/components/cart-provider'
import { TrackingScripts } from '@/components/tracking-scripts'
import type { Metadata, Viewport } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

const brand = process.env.NEXT_PUBLIC_BRAND_NAME || 'Your Brand'
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function generateMetadata(): Promise<Metadata> {
  const seoSettings = await db.setting.findMany({ where: { key: { in: ['seo.title', 'seo.description'] } } }).catch(() => [])
  const seoMap = new Map(seoSettings.map(s => [s.key, s.value]))
  const title = seoMap.get('seo.title') || brand
  const description = seoMap.get('seo.description') || `Shop ${brand} online.`
  return {
    title: { default: title, template: `%s | ${title}` },
    description,
    metadataBase: new URL(siteUrl),
    robots: { index: true, follow: true },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isMaintenancePage = (await headers()).get('x-maintenance-active') === '1'
  // Every page on the site (storefront and admin alike) renders through this
  // root layout, so a transient database hiccup here -- momentary network
  // blip talking to Prisma Accelerate, a cold connection, anything short of
  // a real outage -- must not take down the entire site. A root layout has
  // no error boundary above it (only global-error.tsx, which replaces the
  // whole page), so an uncaught rejection here previously surfaced as a raw
  // Cloudflare "Worker threw exception" page instead of the storefront.
  // Falling back to sane defaults keeps the site rendering through it.
  const [{ theme, navigation }, categories, tracking] = await Promise.all([
    getThemeState().catch(error => {
      console.error('[layout] getThemeState failed, using defaults', error)
      return { theme: defaultTheme, navigation: defaultNavigation }
    }),
    db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }).catch(error => {
      console.error('[layout] category fetch failed, using empty list', error)
      return []
    }),
    getTrackingConfig().catch(error => {
      console.error('[layout] getTrackingConfig failed, tracking disabled', error)
      return { metaPixelId: '', gaMeasurementId: '', tiktokPixelId: '' }
    }),
  ])
  const vars = {
    '--store-bg': theme.colors.background, '--store-surface': theme.colors.surface, '--store-text': theme.colors.text, '--store-muted': theme.colors.muted,
    '--store-primary': theme.colors.primary, '--store-secondary': theme.colors.secondary, '--store-accent': theme.colors.accent,
    '--store-button-text': theme.colors.buttonText, '--store-border': theme.colors.border, '--store-max': `${theme.layout.maxWidth}px`,
    '--store-announcement-bg': theme.colors.announcementBg, '--store-announcement-text': theme.colors.announcementText,
    '--store-section-space': `${theme.layout.sectionSpacing}px`, '--store-card-radius': `${theme.cards.radius}px`, '--store-button-radius': `${theme.buttons.radius}px`,
    '--store-button-height': `${theme.buttons?.height || 48}px`, '--store-btn-transform': theme.buttons?.uppercase ? 'uppercase' : 'none',
    '--store-font-heading': fontCssStack(theme.typography?.heading), '--store-font-body': fontCssStack(theme.typography?.body),
    '--store-animation-duration': `${theme.animations?.duration || 420}ms`,
    '--store-animation-easing': theme.animations?.easing || 'cubic-bezier(.22,.8,.26,1)', '--store-btn-style': theme.buttons?.style || 'solid', '--store-btn-hover': theme.buttons?.hover || 'lift',
    '--store-header-logo-width': `${theme.header?.logoWidth || 160}px`,
  } as React.CSSProperties
  const adminThemeScript = `try{if(location.pathname.startsWith('/admin')){var t=localStorage.getItem('admin.theme')==='dark'?'dark':'light';document.documentElement.dataset.adminTheme=t;document.documentElement.style.colorScheme=t}}catch(e){}`
  // These need to be visible at :root, not just <body>: several
  // storefront-legacy.css :root{} rules resolve their own tokens via
  // var(--store-x, fallback), and that lookup only sees custom properties
  // visible at the same-or-ancestor element as the rule itself -- :root
  // matches <html>, so anything only set on <body> (a descendant) would be
  // invisible to those lookups and silently fall back to hardcoded defaults.
  // A real :root{} stylesheet rule achieves that without touching <html>'s
  // style attribute, which the admin dark-mode script above (and its
  // equivalent effect in theme-preview-frame.tsx) also mutates directly --
  // putting these on html's own `style` prop instead made React's hydration
  // diff that script's plain DOM mutation against React's tracked style
  // object and warn on every /admin/* load.
  const rootVarsCss = `:root{${Object.entries(vars).map(([key, value]) => `${key}:${String(value).replace(/[{}<]/g, '')}`).join(';')}}`
  if (isMaintenancePage) {
    return <html lang="en" className={FONT_VARIABLE_CLASSES}><head><style dangerouslySetInnerHTML={{__html:rootVarsCss}}/><link rel="stylesheet" href="/theme-fallback.css?v=13"/>{theme.faviconUrl ? <link rel="icon" href={theme.faviconUrl}/> : null}</head><body>{children}</body></html>
  }
  return <html lang="en" className={FONT_VARIABLE_CLASSES}><head><script dangerouslySetInnerHTML={{__html:adminThemeScript}}/><style dangerouslySetInnerHTML={{__html:rootVarsCss}}/><link rel="stylesheet" href="/theme-fallback.css?v=13"/>{theme.faviconUrl ? <link rel="icon" href={theme.faviconUrl}/> : null}{theme.customCss ? <style dangerouslySetInnerHTML={{ __html: theme.customCss }}/> : null}</head><body className={theme.animations?.enabled ? 'animations-enabled' : ''}><TrackingScripts config={tracking}/><CartProvider><LiveVisitorTracker/><StoreNavRuntime theme={theme} navigation={navigation} categories={categories}/><StoreNavScroll/>{children}</CartProvider></body></html>
}
