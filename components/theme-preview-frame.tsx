'use client'

import { useEffect, useState } from 'react'
import { CartProvider } from '@/components/cart-provider'
import StoreNavFixed from '@/components/store-nav-fixed'
import { WhatsAppFloat } from '@/components/market-chrome'
import StorefrontSections from '@/components/storefront-sections'
import { StorefrontPreviewContext } from '@/components/preview-context'
import CustomPageView from '@/components/custom-page-view'
import { BlogIndexView } from '@/components/blog-views'
import AliExpressProduct from '@/components/aliexpress-product'
import AliExpressShop from '@/components/aliexpress-shop'
import AliExpressCart from '@/components/aliexpress-cart'
import { Footer } from '@/components/footer'
import { fontCssStack } from '@/lib/font-options'
import { localize } from '@/lib/i18n'
import { LangProvider } from '@/components/lang-provider'

// The page this iframe is mounted at renders through the same root
// app/layout.tsx as the live site, so its <html> already carries --store-*
// vars computed from the *published* theme. Editing is draft-only until
// Publish, so this recomputes the same vars from the postMessage'd draft
// theme and writes them directly onto document.documentElement (<html>) via
// a DOM effect below -- several storefront-legacy.css :root{} rules resolve
// their own tokens with var(--store-x, fallback), and that lookup only sees
// custom properties visible at :root (<html>) itself or an ancestor, so
// setting these any lower (e.g. a wrapping div) would silently be invisible
// to those rules and fall back to their hardcoded defaults.
function themeCssVars(theme: Record<string, any>): React.CSSProperties {
  const colors = theme.colors || {}
  const layout = theme.layout || {}
  const cards = theme.cards || {}
  const buttons = theme.buttons || {}
  const animations = theme.animations || {}
  return {
    '--store-bg': colors.background, '--store-surface': colors.surface, '--store-text': colors.text, '--store-muted': colors.muted,
    '--store-primary': colors.primary, '--store-secondary': colors.secondary, '--store-accent': colors.accent, '--store-sale': colors.sale,
    '--store-button-text': colors.buttonText, '--store-border': colors.border, '--store-max': layout.maxWidth ? `${layout.maxWidth}px` : undefined,
    '--store-announcement-bg': colors.announcementBg, '--store-announcement-text': colors.announcementText,
    '--store-section-space': layout.sectionSpacing ? `${layout.sectionSpacing}px` : undefined,
    '--store-card-radius': cards.radius !== undefined ? `${cards.radius}px` : undefined,
    '--store-button-radius': buttons.radius !== undefined ? `${buttons.radius}px` : undefined,
    '--store-button-height': `${buttons.height || 48}px`, '--store-btn-transform': buttons.uppercase ? 'uppercase' : 'none',
    '--store-font-heading': fontCssStack(theme.typography?.heading), '--store-font-body': fontCssStack(theme.typography?.body),
    '--store-animation-duration': `${animations.duration || 420}ms`,
    '--store-animation-easing': animations.easing || 'cubic-bezier(.22,.8,.26,1)', '--store-btn-style': buttons.style || 'solid', '--store-btn-hover': buttons.hover || 'lift',
    '--store-header-logo-width': theme.header?.logoWidth ? `${theme.header.logoWidth}px` : undefined,
  } as React.CSSProperties
}

type AnyMap = Record<string, any>
type PreviewState = {
  page: string
  pageInfo: { title: string; bodyHtml?: string | null } | null
  blogPosts: AnyMap[]
  theme: AnyMap
  sections: AnyMap[]
  // The site-wide header + announcement bar from the Home list (lib/site-header.ts).
  siteHeader: AnyMap[]
  navigation: any[]
  products: AnyMap[]
  collections: AnyMap[]
  selectedId: string
  // The language being edited in the theme editor (components/theme-studio.tsx).
  lang: 'en' | 'ar'
} | null

// The theme editor (components/theme-studio.tsx) renders this page inside
// a same-origin iframe and posts the draft state below across on every change.
// Message shapes:
//   parent -> frame: { source: 'theme-editor', type: 'state', page, theme, sections, siteHeader, navigation, products, collections, selectedId }
//   `page` is the template being edited ('Home page' | 'Product' | 'Collection' | 'Cart'); `sections` is
//   that page's full list for Home, or just its addable content zone for the other three. `siteHeader`
//   is the header + announcement bar from the Home list, shown on every page like the live site.
//   frame -> parent: { source: 'theme-preview', type: 'ready' }
//   frame -> parent: { source: 'theme-preview', type: 'select', sectionId }
//   frame -> parent: { source: 'theme-preview', type: 'height', height }
//   frame -> parent: { source: 'theme-preview', type: 'shortcut', key: 's' | 'z' | 'y', shift }
export default function ThemePreviewFrame() {
  const [state, setState] = useState<PreviewState>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      const data = event.data
      if (!data || data.source !== 'theme-editor' || data.type !== 'state') return
      setState({
        page: typeof data.page === 'string' ? data.page : 'Home page',
        pageInfo: data.pageInfo && typeof data.pageInfo === 'object' ? data.pageInfo : null,
        blogPosts: Array.isArray(data.blogPosts) ? data.blogPosts : [],
        theme: data.theme,
        sections: Array.isArray(data.sections) ? data.sections : [],
        siteHeader: Array.isArray(data.siteHeader) ? data.siteHeader : [],
        navigation: Array.isArray(data.navigation) ? data.navigation : [],
        products: Array.isArray(data.products) ? data.products : [],
        collections: Array.isArray(data.collections) ? data.collections : [],
        selectedId: data.selectedId || '',
        lang: data.lang === 'ar' ? 'ar' : 'en',
      })
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ source: 'theme-preview', type: 'ready' }, window.location.origin)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Editor shortcuts (save / undo / redo) must keep working when a merchant has clicked
  // into the preview, where key events never reach the editor's own window.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key !== 's' && key !== 'z' && key !== 'y') return
      event.preventDefault()
      window.parent.postMessage({ source: 'theme-preview', type: 'shortcut', key, shift: event.shiftKey }, window.location.origin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Report content height to the parent so it can size the iframe element
  // itself to fit, rather than nesting a second scrollbar inside the
  // editor's own scroll container.
  useEffect(() => {
    const report = () => window.parent.postMessage({ source: 'theme-preview', type: 'height', height: document.documentElement.scrollHeight }, window.location.origin)
    const observer = new ResizeObserver(report)
    observer.observe(document.documentElement)
    report()
    return () => observer.disconnect()
  }, [state])

  useEffect(() => {
    if (!state?.theme) return
    const root = document.documentElement
    const vars = themeCssVars(state.theme)
    Object.entries(vars).forEach(([key, value]) => {
      if (value === undefined) return
      root.style.setProperty(key, String(value))
    })
    document.body.classList.toggle('mk', state.theme.design === 'market')
  }, [state?.theme])

  // Every visible section renders exactly one top-level node inside the StorefrontSections
  // root (.themeEditorPreview): sections with nothing to show render an editor notice
  // instead of nothing, so the n-th visible section is the n-th child. (Counting only
  // .focalSection nodes skipped the flash deals / new arrivals / strip sections, so
  // picking a section in the sidebar scrolled to the wrong one.)
  useEffect(() => {
    if (!state?.selectedId) return
    const visibleIndex = state.sections
      .filter(section => section.enabled !== false && section.settings?.enabled !== false && section.type !== 'header' && section.type !== 'announcement' && section.type !== 'footer')
      .findIndex(section => section.id === state.selectedId)
    if (visibleIndex < 0) return
    const root = document.querySelector<HTMLElement>('.themeEditorPreview')
    const nodes = root ? Array.from(root.children).filter(node => node.tagName !== 'STYLE') as HTMLElement[] : []
    nodes[visibleIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state?.selectedId, state?.sections])

  // Arabic preview: the page reads right to left, like the live Arabic store.
  useEffect(() => {
    const root = document.documentElement
    const lang = state?.lang || 'en'
    root.lang = lang
    root.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [state?.lang])

  if (!state) return <div style={{ minHeight: '100vh' }} />
  const view = state.lang === 'ar' ? { ...state, theme: localize(state.theme, 'ar'), sections: localize(state.sections, 'ar'), siteHeader: localize(state.siteHeader, 'ar'), navigation: localize(state.navigation, 'ar') } : state

  // The nav bar shows the header + announcement bar being edited in the Home list, on every
  // page, like the live site (lib/site-header.ts).
  const navTheme = { ...view.theme, siteHeader: view.siteHeader }

  const select = (sectionId: string) => window.parent.postMessage({ source: 'theme-preview', type: 'select', sectionId }, window.location.origin)
  const sample = pageSample(view)

  return (
    <LangProvider lang={view.lang}>
    <CartProvider>
      <StorefrontPreviewContext.Provider value={{ selectedId: view.selectedId, onSelect: select }}>
      <StoreNavFixed theme={navTheme} navigation={view.navigation} />
      <WhatsAppFloat theme={{ ...view.theme, __preview: true }} />
      {view.page === 'BlogPages' ? (
        // The blog list with the merchant's published posts, then the editable zone -- the
        // same markup and order as the live /blog route.
        <div className="focalStorefront">
          <BlogIndexView posts={view.blogPosts.map(post => ({ ...post, tags: Array.isArray(post.tags) ? post.tags : [] })) as any} />
          {view.sections.length > 0 && <StorefrontSections theme={view.theme} sections={view.sections} products={view.products} collections={view.collections} />}
        </div>
      ) : view.page.startsWith('Page:') ? (
        <CustomPageView theme={view.theme} page={view.pageInfo || { title: 'Page', bodyHtml: '' }} sections={view.sections} products={view.products} collections={view.collections} />
      ) : view.page === 'Home page' ? (
        // The live homepage wraps its sections in .aliHome (it sets the page background).
        <div className="aliHome">
          <StorefrontSections
            theme={view.theme}
            sections={view.sections}
            products={view.products}
            collections={view.collections}
            preview
            selectedId={view.selectedId}
            onSelect={select}
          />
        </div>
      ) : (
        // These are the same components the live site renders -- the page's own
        // content is real and untouched, with only the merchant-editable zone
        // (view.sections) driven by the editor. Sample products/collections
        // stand in for whatever a visitor's own URL would load.
        <>
          {sample ? (
            view.page === 'Product' ? (
              <AliExpressProduct
                theme={view.theme}
                product={sample.product}
                related={sample.related}
                variantAvailability={[]}
                productAvailable={sample.product.variants?.length ? 99 : Number(sample.product.stock ?? 99)}
                trackInventory={false}
                continueSellingWhenOutOfStock
                reviewEligibility="guest"
                sections={view.sections}
                collections={view.collections}
              />
            ) : view.page === 'Collection' ? (
              <AliExpressShop theme={view.theme} products={view.products} collections={view.collections} query={{}} sections={view.sections} />
            ) : (
              <AliExpressCart theme={view.theme} recommended={sample.related} sections={view.sections} zoneCollections={view.collections} />
            )
          ) : (
            <div style={{ padding: '96px 24px', textAlign: 'center', color: 'var(--store-muted, #6b7280)' }}>
              Add at least one active product to preview this page.
            </div>
          )}
        </>
      )}
      <Footer theme={view.theme} />
      </StorefrontPreviewContext.Provider>
    </CartProvider>
    </LangProvider>
  )
}

// Product pages need a real product to render; the Shop/Collection and Cart
// previews only need the product list. Returns null when the store has no
// products yet, so the preview explains itself instead of crashing.
function pageSample(state: NonNullable<PreviewState>) {
  const product = state.products[0]
  if (!product) return null
  return { product, related: state.products.filter(p => p.id !== product.id).slice(0, 12) }
}
