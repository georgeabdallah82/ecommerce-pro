'use client'

import { useEffect, useState } from 'react'
import { CartProvider } from '@/components/cart-provider'
import StoreNavFixed from '@/components/store-nav-fixed'
import StorefrontSections from '@/components/storefront-sections'
import { StorefrontPreviewContext } from '@/components/preview-context'
import CustomPageView from '@/components/custom-page-view'
import { BlogIndexView } from '@/components/blog-views'
import AliExpressProduct from '@/components/aliexpress-product'
import AliExpressShop from '@/components/aliexpress-shop'
import AliExpressCart from '@/components/aliexpress-cart'
import { Footer } from '@/components/footer'
import { fontCssStack } from '@/lib/font-options'

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
  navigation: any[]
  products: AnyMap[]
  collections: AnyMap[]
  selectedId: string
} | null

// The theme editor (components/theme-studio.tsx) renders this page inside
// a same-origin iframe and posts the draft state below across on every change.
// Message shapes:
//   parent -> frame: { source: 'theme-editor', type: 'state', page, theme, sections, navigation, products, collections, selectedId }
//   `page` is the template being edited ('Home page' | 'Product' | 'Collection' | 'Cart'); `sections` is
//   that page's full list for Home, or just its addable content zone for the other three.
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
        navigation: Array.isArray(data.navigation) ? data.navigation : [],
        products: Array.isArray(data.products) ? data.products : [],
        collections: Array.isArray(data.collections) ? data.collections : [],
        selectedId: data.selectedId || '',
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
  }, [state?.theme])

  // Position-indexed against every .focalSection node inside a StorefrontSections
  // root (.themeEditorPreview), matching the filtered "visible" list it builds.
  // Scoping to that root -- rather than the whole document -- keeps this correct on
  // the Product/Shop/Cart previews, where the page's own untouched content sits
  // above the zone. category_strip/flash_deals/new_arrivals/best_sellers (see
  // components/storefront-sections.tsx) render with their own fixed ali-prefixed
  // classnames instead of the generic .focalSection shell, so selecting one of
  // those four from the editor's sidebar won't auto-scroll the preview to it (it
  // can still be clicked directly in the preview to select it).
  useEffect(() => {
    if (!state?.selectedId) return
    const visibleIndex = state.sections
      .filter(section => section.enabled !== false && section.settings?.enabled !== false && section.type !== 'header' && section.type !== 'announcement' && section.type !== 'footer')
      .findIndex(section => section.id === state.selectedId)
    if (visibleIndex < 0) return
    const nodes = document.querySelectorAll<HTMLElement>('.themeEditorPreview .focalSection')
    nodes[visibleIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state?.selectedId, state?.sections])

  if (!state) return <div style={{ minHeight: '100vh' }} />

  // StoreNavFixed reads the header's live settings off theme.editorTemplates.Pages
  // rather than theme.editorTemplates['Home page'], so the nav bar reflects
  // in-progress header edits made on any template page, not just Home.
  const navTheme = { ...state.theme, editorTemplates: { ...(state.theme.editorTemplates || {}), Pages: state.sections } }

  const select = (sectionId: string) => window.parent.postMessage({ source: 'theme-preview', type: 'select', sectionId }, window.location.origin)
  const sample = pageSample(state)

  return (
    <CartProvider>
      <StorefrontPreviewContext.Provider value={{ selectedId: state.selectedId, onSelect: select }}>
      <StoreNavFixed theme={navTheme} navigation={state.navigation} />
      {state.page === 'BlogPages' ? (
        // The blog list with the merchant's published posts, then the editable zone -- the
        // same markup and order as the live /blog route.
        <div className="focalStorefront">
          <BlogIndexView posts={state.blogPosts.map(post => ({ ...post, tags: Array.isArray(post.tags) ? post.tags : [] })) as any} />
          {state.sections.length > 0 && <StorefrontSections theme={state.theme} sections={state.sections} products={state.products} collections={state.collections} />}
        </div>
      ) : state.page.startsWith('Page:') ? (
        <CustomPageView theme={state.theme} page={state.pageInfo || { title: 'Page', bodyHtml: '' }} sections={state.sections} products={state.products} collections={state.collections} />
      ) : state.page === 'Home page' ? (
        <StorefrontSections
          theme={state.theme}
          sections={state.sections}
          products={state.products}
          collections={state.collections}
          preview
          selectedId={state.selectedId}
          onSelect={select}
        />
      ) : (
        // These are the same components the live site renders -- the page's own
        // content is real and untouched, with only the merchant-editable zone
        // (state.sections) driven by the editor. Sample products/collections
        // stand in for whatever a visitor's own URL would load.
        <>
          {sample ? (
            state.page === 'Product' ? (
              <AliExpressProduct
                theme={state.theme}
                product={sample.product}
                related={sample.related}
                variantAvailability={[]}
                productAvailable={sample.product.variants?.length ? 99 : Number(sample.product.stock ?? 99)}
                trackInventory={false}
                continueSellingWhenOutOfStock
                reviewEligibility="guest"
                sections={state.sections}
                collections={state.collections}
              />
            ) : state.page === 'Collection' ? (
              <AliExpressShop theme={state.theme} products={state.products} collections={state.collections} query={{}} sections={state.sections} />
            ) : (
              <AliExpressCart theme={state.theme} recommended={sample.related} sections={state.sections} zoneCollections={state.collections} />
            )
          ) : (
            <div style={{ padding: '96px 24px', textAlign: 'center', color: 'var(--store-muted, #6b7280)' }}>
              Add at least one active product to preview this page.
            </div>
          )}
        </>
      )}
      <Footer theme={state.theme} />
      </StorefrontPreviewContext.Provider>
    </CartProvider>
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
