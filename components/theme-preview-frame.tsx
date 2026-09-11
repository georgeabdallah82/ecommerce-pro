'use client'

import { useEffect, useState } from 'react'
import { CartProvider } from '@/components/cart-provider'
import StoreNavFixed from '@/components/store-nav-fixed'
import StorefrontSections from '@/components/storefront-sections'
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
    '--store-primary': colors.primary, '--store-secondary': colors.secondary, '--store-accent': colors.accent,
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
  theme: AnyMap
  sections: AnyMap[]
  navigation: any[]
  products: AnyMap[]
  collections: AnyMap[]
  selectedId: string
} | null

// The theme editor (components/focal-theme-editor.tsx) renders this page inside
// a same-origin iframe and posts the draft state below across on every change.
// Message shapes:
//   parent -> frame: { source: 'theme-editor', type: 'state', theme, sections, navigation, products, collections, selectedId }
//   frame -> parent: { source: 'theme-preview', type: 'ready' }
//   frame -> parent: { source: 'theme-preview', type: 'select', sectionId }
//   frame -> parent: { source: 'theme-preview', type: 'height', height }
export default function ThemePreviewFrame() {
  const [state, setState] = useState<PreviewState>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      const data = event.data
      if (!data || data.source !== 'theme-editor' || data.type !== 'state') return
      setState({
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

  useEffect(() => {
    if (!state?.selectedId) return
    const visibleIndex = state.sections
      .filter(section => section.enabled !== false && section.settings?.enabled !== false && section.type !== 'header' && section.type !== 'announcement' && section.type !== 'footer')
      .findIndex(section => section.id === state.selectedId)
    if (visibleIndex < 0) return
    const nodes = document.querySelectorAll<HTMLElement>('.focalSection')
    nodes[visibleIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state?.selectedId, state?.sections])

  if (!state) return <div style={{ minHeight: '100vh' }} />

  // StoreNavFixed reads the header's live settings off theme.editorTemplates.Pages
  // rather than theme.editorTemplates['Home page'], so the nav bar reflects
  // in-progress header edits made on any template page, not just Home.
  const navTheme = { ...state.theme, editorTemplates: { ...(state.theme.editorTemplates || {}), Pages: state.sections } }

  return (
    <CartProvider>
      <StoreNavFixed theme={navTheme} navigation={state.navigation} />
      <StorefrontSections
        theme={state.theme}
        sections={state.sections}
        products={state.products}
        collections={state.collections}
        preview
        selectedId={state.selectedId}
        onSelect={sectionId => window.parent.postMessage({ source: 'theme-preview', type: 'select', sectionId }, window.location.origin)}
      />
    </CartProvider>
  )
}
