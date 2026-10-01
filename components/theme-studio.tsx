'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AtSign,
  BadgeCheck,
  Check,
  Columns3,
  Compass,
  Copy,
  FolderOpen,
  GalleryHorizontal,
  GalleryHorizontalEnd,
  Camera,
  Grid2x2,
  GripVertical,
  HelpCircle,
  History,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Grid3x3,
  Mail,
  Megaphone,
  Menu,
  MessageSquareQuote,
  Monitor,
  Package,
  PackageCheck,
  Palette,
  PanelBottom,
  PanelTop,
  Plus,
  Redo2,
  Rocket,
  Save,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  Store,
  Tablet,
  Timer,
  Trash2,
  TrendingUp,
  Type as TypeIcon,
  Undo2,
  Video,
  X,
  Zap,
} from 'lucide-react'
import SectionInspector, {
  renderPanel,
  text, image, textarea, select, toggle, range, color,
  type PanelSchema, type FieldCtx,
} from '@/components/theme-section-inspector'
import ThemeInspectorStyles from '@/components/theme-inspector-styles'
import ThemePublishBar from '@/components/theme-publish-bar'
import { FONT_OPTIONS } from '@/lib/font-options'
import styles from './theme-studio.module.css'

// Deliberately not under /admin -- see app/theme-editor-preview/page.tsx's top comment.
const PREVIEW_PATH = '/theme-editor-preview'

type AnyMap = Record<string, any>
type Section = { id: string; type: string; enabled?: boolean; settings?: AnyMap; blocks?: AnyMap[] }
type Snapshot = { theme: AnyMap; templates: Record<string, Section[]>; page: string; selectedId: string }
type Props = { initial: { theme: AnyMap; sections: Section[]; navigation: any[]; draft: boolean } }

// The four page templates the editor manages. Home is a full section builder;
// the other three append a merchant-editable content zone below that page's own
// built-in commerce UI (product purchase flow, shop/collection listing, cart
// and checkout handoff), which this editor deliberately never touches.
const PAGE_TABS = [
  { key: 'Home page', label: 'Home' },
  { key: 'Product', label: 'Product' },
  { key: 'Collection', label: 'Collection & shop' },
  { key: 'Cart', label: 'Cart' },
]
const PAGES = PAGE_TABS.map(tab => tab.key)
// Structural entries kept in a zone page's stored template (header/announcement
// are read by store-nav-fixed.tsx, main_* are the placeholders lib/theme.ts's
// repairTemplate looks for) that must never show up as editable rows -- they
// don't render as content, so listing them would be decoration again.
const ZONE_HIDDEN_TYPES = new Set(['header', 'announcement', 'footer', 'main_product', 'main_collection_banner', 'main_collection_grid'])
const PAGE_ZONE_COPY: Record<string, { title: string; body: string }> = {
  Product: { title: 'Product page content', body: 'Sections you add appear below the product, its reviews and recommendations on every product page.' },
  Collection: { title: 'Collection & shop content', body: 'Sections you add appear below the product listing on /shop and every collection page.' },
  Cart: { title: 'Cart page content', body: 'Sections you add appear below the cart and its recommendations.' },
}
// Header and Announcement are read globally by the storefront nav, independent
// of which page you're viewing.
// app/page.tsx renders the Home page's full sections list through the same
// generic StorefrontSections engine used everywhere else (components/
// storefront-sections.tsx) -- real position, any of these ~30 types, any
// number of them. hero/category_strip/flash_deals/collection_grid/
// new_arrivals/best_sellers are the only ones that carry AliExpress-specific
// styling of their own; every other type (image_with_text, testimonials,
// promo_grid, etc.) is just as genuinely live here as any of those six.
const HOME_LIVE_TYPES = ['hero', 'category_strip', 'flash_deals', 'collection_grid', 'new_arrivals', 'best_sellers']
const HOME_ALLOWED_TYPES = ['header', 'announcement', ...HOME_LIVE_TYPES]
// Four of the six (category_strip/flash_deals/new_arrivals/best_sellers)
// render on the live homepage purely from their own data existing
// (collections, discounted/new/best-selling products), with no section
// object required at all -- so without backfilling a default row for
// whichever of the eight "always there" types is missing from stored data,
// they'd be live on the site but permanently missing, and therefore
// un-toggleable and un-configurable, from this list. This only ever adds
// missing rows; it never removes one, unlike an earlier version of this
// function that also dropped any type outside this set -- every type is now
// genuinely renderable here, so there's nothing left to drop.
const sanitizeHomeSections = (list: Section[]) => {
  const present = new Set(list.map(section => section.type))
  const backfilled = [...list]
  for (const type of HOME_ALLOWED_TYPES) if (!present.has(type)) backfilled.push(sectionDefaults(type))
  return backfilled
}
const META: Record<string, string> = {
  announcement: 'Announcement bar',
  header: 'Header',
  hero: 'Image banner',
  category_strip: 'Category strip',
  flash_deals: 'Flash deals',
  new_arrivals: 'New arrivals',
  best_sellers: 'Best sellers',
  slideshow: 'Slideshow',
  video: 'Video',
  image_with_text: 'Image with text',
  product_grid: 'Featured collection',
  product_carousel: 'Product carousel',
  featured_product: 'Featured product',
  product_recommendations: 'Product recommendations',
  main_product: 'Main product',
  collection_grid: 'Collection list',
  collection_carousel: 'Collection carousel',
  main_collection_banner: 'Collection banner',
  main_collection_grid: 'Collection products',
  multicolumn: 'Multicolumn',
  promo_grid: 'Promo grid',
  rich_text: 'Rich text',
  testimonials: 'Testimonials',
  logo_list: 'Logo list',
  faq: 'Collapsible content',
  newsletter: 'Email signup',
  trust_badges: 'Trust badges',
  countdown: 'Countdown timer',
  stats: 'Stats / counters',
  social_grid: 'Social / Instagram feed',
  footer: 'Footer',
}
const SECTION_ICONS: Record<string, typeof ImageIcon> = {
  announcement: Megaphone,
  header: Menu,
  hero: ImageIcon,
  category_strip: Compass,
  flash_deals: Zap,
  new_arrivals: Rocket,
  best_sellers: Star,
  slideshow: Images,
  video: Video,
  image_with_text: SplitSquareHorizontal,
  product_grid: Grid3x3,
  product_carousel: GalleryHorizontalEnd,
  featured_product: Package,
  product_recommendations: Sparkles,
  main_product: PackageCheck,
  collection_grid: FolderOpen,
  collection_carousel: GalleryHorizontal,
  main_collection_banner: PanelTop,
  main_collection_grid: LayoutGrid,
  multicolumn: Columns3,
  promo_grid: Grid2x2,
  rich_text: TypeIcon,
  testimonials: MessageSquareQuote,
  logo_list: BadgeCheck,
  faq: HelpCircle,
  newsletter: Mail,
  trust_badges: ShieldCheck,
  countdown: Timer,
  stats: TrendingUp,
  social_grid: Camera,
  footer: PanelBottom,
}
const clone = <T,>(value: T): T => structuredClone(value)
const makeId = (type: string) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const rows = (value: any) => (Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : [])

function sectionDefaults(type: string): Section {
  const base = { spacing: 72, contentWidth: 1180, animation: 'fade-up' }
  if (type === 'announcement') return { id: makeId(type), type, enabled: true, settings: { ...base, height: 40, speed: 6, autoplay: true, dismissible: true, position: 'above' }, blocks: [{ id: makeId('message'), type: 'message', settings: { text: 'Free shipping on orders over $50', link: '' } }] }
  if (type === 'header') return { id: makeId(type), type, enabled: true, settings: { ...base, sticky: true, showSearch: true, showAccount: true, showCart: true, logoWidth: 160 } }
  if (type === 'hero') return { id: makeId(type), type, enabled: true, settings: { ...base, showContent: true, eyebrow: 'NEW COLLECTION', heading: 'Make your store impossible to ignore.', text: 'A premium storefront built for conversion.', buttonLabel: 'Shop now', buttonUrl: '/shop', imageUrl: '', mobileImageUrl: '', minHeight: 640, contentPosition: 'center-left', overlay: 0.2, overlayColor: '#000000', overlayStyle: 'none', imageFit: 'cover', focalX: 50, focalY: 50 } }
  if (type === 'product_grid' || type === 'product_carousel' || type === 'product_recommendations') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: type === 'product_recommendations' ? 'You may also like' : 'Featured products', limit: 8, columns: 4, showViewAll: true } }
  if (type === 'featured_product') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Featured product', limit: 1, columns: 1, productId: '' } }
  if (type === 'collection_grid' || type === 'collection_carousel') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Shop by collection', limit: 8, columns: 4, collectionIds: [] } }
  if (type === 'category_strip') return { id: makeId(type), type, enabled: true, settings: { limit: 12 } }
  if (type === 'flash_deals') return { id: makeId(type), type, enabled: true, settings: { heading: 'Flash Deals', limit: 12 } }
  if (type === 'new_arrivals') return { id: makeId(type), type, enabled: true, settings: { heading: 'New Arrivals', limit: 12 } }
  if (type === 'best_sellers') return { id: makeId(type), type, enabled: true, settings: { heading: 'Best Sellers', limit: 12 } }
  if (type === 'main_product') return { id: makeId(type), type, enabled: true, settings: { ...base, previewProductId: '', stickyAddToCart: true, showReviews: true, showWishlist: true } }
  if (type === 'main_collection_banner') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Collection' } }
  if (type === 'main_collection_grid') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Products', limit: 24, columns: 4 } }
  if (type === 'image_with_text') return { id: makeId(type), type, enabled: true, settings: { ...base, eyebrow: 'THE BRAND', heading: 'Tell your story.', text: 'Combine imagery, copy and a strong call to action.', buttonLabel: 'Learn more', buttonUrl: '/about', imageUrl: '', layout: 'image-right' } }
  if (type === 'newsletter') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Stay in the loop', text: 'Get launches, drops and offers in your inbox.', buttonLabel: 'Subscribe', background: 'primary' } }
  if (type === 'footer') return { id: makeId(type), type, enabled: true, settings: { ...base, columns: 4 } }
  if (type === 'trust_badges') return { id: makeId(type), type, enabled: true, settings: { ...base }, blocks: [
    { id: makeId('badge'), type: 'badge', settings: { icon: 'truck', heading: 'Free shipping', text: 'On orders over $50' } },
    { id: makeId('badge'), type: 'badge', settings: { icon: 'return', heading: 'Easy returns', text: '30-day window' } },
    { id: makeId('badge'), type: 'badge', settings: { icon: 'lock', heading: 'Secure checkout', text: 'Encrypted payments' } },
    { id: makeId('badge'), type: 'badge', settings: { icon: 'support', heading: '24/7 support', text: 'We are here to help' } },
  ] }
  if (type === 'countdown') return { id: makeId(type), type, enabled: true, settings: { ...base, eyebrow: 'FLASH SALE', heading: 'Deals end soon', text: "Don't miss out on this offer.", buttonLabel: 'Shop now', buttonUrl: '/shop', endDate: '', collection: '', limit: 6, background: 'primary' } }
  if (type === 'stats') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Trusted by thousands', columns: 4 }, blocks: [
    { id: makeId('stat'), type: 'stat', settings: { value: '50K+', label: 'Happy customers' } },
    { id: makeId('stat'), type: 'stat', settings: { value: '4.9', label: 'Average rating' } },
    { id: makeId('stat'), type: 'stat', settings: { value: '120+', label: 'Countries shipped' } },
    { id: makeId('stat'), type: 'stat', settings: { value: '24/7', label: 'Customer support' } },
  ] }
  if (type === 'social_grid') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Shop the feed', handle: '@yourbrand', columns: 5 }, blocks: [] }
  return { id: makeId(type), type, enabled: true, settings: { ...base, heading: META[type] || 'Section' } }
}

function defaultTemplates(source: Section[]) {
  const liveDefaults = [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('hero'), sectionDefaults('category_strip'), sectionDefaults('flash_deals'), sectionDefaults('collection_grid'), sectionDefaults('new_arrivals'), sectionDefaults('best_sellers')]
  const sanitized = source?.length ? sanitizeHomeSections(clone(source)) : []
  const home = sanitized.length ? sanitized : liveDefaults
  return {
    'Home page': home,
    // Empty on purpose: these three are addable zones, so a store that has
    // never added anything must render nothing extra (see lib/theme.ts).
    Product: [],
    Collection: [],
    Cart: [],
  } as Record<string, Section[]>
}

// ---- Theme settings categories ----
// Each category edits one theme[group] object (or the theme root, for
// Branding) using the exact same declarative field schema + renderer as
// section editing (components/theme-section-inspector.tsx), so both live in
// the same drawer with the same visual language instead of two separate
// systems. Only settings actually read live by the storefront are listed --
// see app/cart/page.tsx, components/aliexpress-product.tsx,
// components/aliexpress-collection-detail.tsx and components/aliexpress-shop.tsx
// for exactly which of theme.productPage/collectionPage/cart each field drives.
const ROOT_GROUP = '__root__'
type ThemeCategory = { key: string; label: string; icon: typeof ImageIcon; group: string; panels: PanelSchema[] }
const THEME_CATEGORIES: ThemeCategory[] = [
  { key: 'branding', label: 'Branding', icon: Store, group: ROOT_GROUP, panels: [
    { title: 'Branding', fields: [text('Brand name', 'brandName'), image('Logo', 'logoUrl'), image('Logo (for dark backgrounds, e.g. footer)', 'logoUrlDark'), image('Favicon', 'faviconUrl')] },
  ] },
  { key: 'header', label: 'Header', icon: Menu, group: 'header', panels: [
    { title: 'Header', fields: [toggle('Show wishlist icon', 'showWishlist', false), toggle('Transparent header', 'transparent', false), toggle('Transparent on homepage only', 'transparentHome', false)] },
  ] },
  { key: 'productPage', label: 'Product page', icon: Package, group: 'productPage', panels: [
    { title: 'Content', fields: [
      toggle('Show breadcrumbs', 'showBreadcrumbs', true),
      toggle('Show vendor', 'showVendor', true),
      toggle('Show reviews', 'showReviews', true),
      toggle('Show share button', 'showShare', true),
      toggle('Show wishlist button', 'showWishlist', true),
      toggle('Show description accordion', 'showDescription', true),
      toggle('Show specifications accordion', 'showSpecs', true),
      [toggle('Show shipping & returns accordion', 'showShippingAccordion', true)],
      textarea('Shipping & returns text', 'shippingText'),
    ] },
    { title: 'Related products', fields: [toggle('Show related products', 'showRelated', true), range('Products shown', 'relatedLimit', 4, 20, 12)] },
    { title: 'Purchase area', fields: [toggle('Show trust badges', 'showTrustBadges', true), toggle('Show stock counter', 'showStockCounter', true), toggle('Show quantity selector', 'showQuantity', true)] },
  ] },
  { key: 'collectionPage', label: 'Collection & shop pages', icon: FolderOpen, group: 'collectionPage', panels: [
    { title: 'Content', fields: [
      toggle('Show breadcrumbs', 'showBreadcrumbs', true),
      toggle('Show collection description', 'showDescription', true),
      toggle('Show collection banner image', 'showImage', true),
      toggle('Show sort control', 'showSort', true),
      toggle('Show filters (Shop page sidebar)', 'showFilters', true),
    ] },
  ] },
  { key: 'cart', label: 'Cart', icon: ShoppingCart, group: 'cart', panels: [
    { title: 'Cart', fields: [
      toggle('Sticky mobile checkout bar', 'stickyCheckout', true),
      toggle('Free shipping progress bar', 'freeShippingBar', true),
      toggle('Show "You might also like"', 'recommendations', true),
    ] },
  ] },
  { key: 'footer', label: 'Footer', icon: PanelBottom, group: 'footer', panels: [
    { title: 'Footer', fields: [toggle('Show newsletter signup', 'showNewsletter', true), text('Description text', 'text'), range('Link columns shown', 'columns', 2, 4, 4)] },
  ] },
  { key: 'social', label: 'Social links', icon: AtSign, group: 'social', panels: [
    { title: 'Social links', fields: [text('Instagram URL', 'instagram'), text('Facebook URL', 'facebook'), text('TikTok URL', 'tiktok'), text('X / Twitter URL', 'twitter'), text('YouTube URL', 'youtube')] },
  ] },
  { key: 'colors', label: 'Colors', icon: Palette, group: 'colors', panels: [
    { title: 'Colors', fields: [
      color('Primary', 'primary', '#0a0a0a'), color('Secondary', 'secondary', '#f0f0f0'), color('Accent', 'accent', '#d4ff3f'),
      color('Background', 'background', '#ffffff'), color('Surface', 'surface', '#f5f5f5'), color('Text', 'text', '#0a0a0a'),
      color('Muted text', 'muted', '#6b6b6b'), color('Border', 'border', '#e5e5e5'), color('Button text', 'buttonText', '#ffffff'),
      color('Announcement bg', 'announcementBg', '#0a0a0a'), color('Announcement text', 'announcementText', '#ffffff'), color('Sale', 'sale', '#ff3b30'),
    ] },
  ] },
  { key: 'typography', label: 'Typography', icon: TypeIcon, group: 'typography', panels: [
    { title: 'Typography', fields: [
      select('Heading font', 'heading', FONT_OPTIONS.map(f => ({ value: f.key, label: f.label })), 'spaceGrotesk'),
      select('Body font', 'body', FONT_OPTIONS.map(f => ({ value: f.key, label: f.label })), 'inter'),
    ] },
  ] },
  { key: 'buttons', label: 'Buttons', icon: Grid2x2, group: 'buttons', panels: [
    { title: 'Buttons', fields: [range('Corner radius', 'radius', 0, 32, 8, undefined, 'px'), range('Height', 'height', 36, 64, 50, undefined, 'px'), toggle('Uppercase label', 'uppercase', true)] },
  ] },
  { key: 'cards', label: 'Cards', icon: LayoutGrid, group: 'cards', panels: [
    { title: 'Cards', fields: [range('Card corner radius', 'radius', 0, 32, 14, undefined, 'px')] },
  ] },
  { key: 'layout', label: 'Layout', icon: Columns3, group: 'layout', panels: [
    { title: 'Layout', fields: [range('Section spacing', 'sectionSpacing', 32, 160, 84, undefined, 'px'), range('Max page width', 'maxWidth', 960, 1600, 1360, 20, 'px')] },
  ] },
]

export default function ThemeStudio({ initial }: Props) {
  const fallback = useMemo(() => defaultTemplates(initial.sections), [initial.sections])
  const [theme, setTheme] = useState<AnyMap>(() => clone(initial.theme || {}))
  const [templates, setTemplates] = useState<Record<string, Section[]>>(() => {
    const stored = initial.theme?.editorTemplates || {}
    const base = clone(fallback)
    for (const key of PAGES) if (Array.isArray(stored[key]) && stored[key].length) base[key] = clone(stored[key])
    base['Home page'] = sanitizeHomeSections(base['Home page'])
    if (!base['Home page'].length) base['Home page'] = clone(fallback['Home page'])
    return base
  })
  const [page, setPage] = useState('Home page')
  const [selectedId, setSelectedId] = useState('')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [sideTab, setSideTab] = useState<'sections' | 'theme' | 'history'>('sections')
  const [activeCategoryKey, setActiveCategoryKey] = useState('')
  const [drawerMode, setDrawerMode] = useState<'section' | 'theme'>('section')
  const [drawerTab, setDrawerTab] = useState<'content' | 'design' | 'advanced'>('content')
  const [drawer, setDrawer] = useState(false)
  const [picker, setPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // A counter rather than a boolean: the iframe can legitimately send a second
  // 'ready' (e.g. a dev-mode reload) after the first handshake already completed,
  // and setPreviewReady(true) on an already-true value is a no-op that drops the
  // state re-push the fresh document needs -- every 'ready' has to force a new
  // effect run, which only a value that always changes can guarantee.
  const [previewReadyToken, setPreviewReadyToken] = useState(0)
  const [previewHeight, setPreviewHeight] = useState(0)
  const [versions, setVersions] = useState<Array<{ id: string; createdAt: string; createdBy: string | null }>>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const confirmAction = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm })
  const [hasDraft, setHasDraft] = useState(initial.draft)
  const [publishing, setPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishError, setPublishError] = useState('')

  const isHome = page === 'Home page'
  const fullPage = templates[page] || []
  // On zone pages the list the editor works with is only the merchant's own
  // content; the structural placeholders are held aside and re-attached on every
  // write (see `withPage`), so they survive a save untouched.
  const current = useMemo(() => (isHome ? fullPage : fullPage.filter(section => !ZONE_HIDDEN_TYPES.has(section.type))), [isHome, fullPage])
  const withPage = (list: Section[]) => ({ ...templates, [page]: isHome ? list : [...fullPage.filter(section => ZONE_HIDDEN_TYPES.has(section.type)), ...list] })
  const selectedIndex = current.findIndex(section => section.id === selectedId)
  const selected = current[selectedIndex] || null
  const activeCategory = THEME_CATEGORIES.find(c => c.key === activeCategoryKey) || null

  useEffect(() => {
    if (!current.some(section => section.id === selectedId)) {
      setSelectedId(current[0]?.id || '')
      if (drawerMode === 'section') setDrawer(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, selectedId])

  useEffect(() => {
    Promise.all([
      fetch('/api/products', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/admin/collections', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([productData, collectionData]) => {
      setProducts(rows(productData))
      setCollections(rows(collectionData))
    })
  }, [])

  // The iframe's src is set imperatively here instead of as a static JSX prop
  // because this page renders under app/admin/loading.tsx's Suspense boundary:
  // Next streams this component's markup into a hidden container before its
  // reveal script swaps it into place, and the browser's HTML parser starts
  // loading anything with a `src` the instant it sees it in that hidden markup
  // -- then the reveal swap discards that node and mounts a genuinely new
  // <iframe> in its place, so the real, final iframe never gets a `src` at
  // all (its handshake with theme-preview-frame.tsx never even starts) while
  // the discarded, invisible one silently eats the only load. Assigning the
  // src ourselves in an effect runs after that swap has settled, so the
  // iframe that's actually on screen is the one that navigates.
  useEffect(() => {
    if (iframeRef.current) iframeRef.current.src = PREVIEW_PATH
  }, [])

  // The preview lives in a same-origin iframe (components/theme-preview-frame.tsx),
  // driven entirely by postMessage instead of shared props/DOM, so the editor
  // chrome's CSS can never bleed into (or be bled into by) the real storefront
  // CSS it's previewing, and device-width preview reflects a real iframe
  // viewport instead of a max-width wrapper div.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (!data || data.source !== 'theme-preview') return
      if (data.type === 'ready') setPreviewReadyToken(t => t + 1)
      else if (data.type === 'select') { setSelectedId(data.sectionId); setDrawerMode('section'); setDrawer(true) }
      else if (data.type === 'height') setPreviewHeight(Number(data.height) || 0)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!previewReadyToken) return
    iframeRef.current?.contentWindow?.postMessage({
      source: 'theme-editor',
      type: 'state',
      page,
      theme,
      sections: current,
      navigation: initial.navigation,
      products,
      collections,
      selectedId,
    }, window.location.origin)
  }, [previewReadyToken, page, theme, current, initial.navigation, products, collections, selectedId])

  const commit = (nextTemplates: Record<string, Section[]>, nextTheme = theme) => {
    setHistory(history => [...history, { theme: clone(theme), templates: clone(templates), page, selectedId }].slice(-50))
    setFuture([])
    setTemplates(nextTemplates)
    setTheme(nextTheme)
    setDirty(true)
  }
  const patch = (patches: AnyMap) => {
    if (!selected) return
    commit(withPage(current.map(section => (section.id === selected.id ? { ...section, settings: { ...(section.settings || {}), ...patches } } : section))))
  }
  const patchTheme = (group: string, patches: AnyMap) => {
    if (group === ROOT_GROUP) { commit(templates, { ...theme, ...patches }); return }
    commit(templates, { ...theme, [group]: { ...(theme[group] || {}), ...patches } })
  }
  const patchBlocks = (blocks: any[]) => {
    if (!selected) return
    commit(withPage(current.map(section => (section.id === selected.id ? { ...section, blocks: clone(blocks) } : section))))
  }
  const toggleSection = (value: boolean) => {
    if (!selected) return
    commit(withPage(current.map(section => (section.id === selected.id ? { ...section, enabled: value } : section))))
  }
  const addSection = (type: string) => {
    const next = sectionDefaults(type)
    const list = [...current]
    list.splice(selectedIndex < 0 ? list.length : selectedIndex + 1, 0, next)
    commit(withPage(list))
    setSelectedId(next.id)
    setDrawerMode('section')
    setDrawer(true)
    setPicker(false)
    setPickerQuery('')
  }
  const removeSection = () => {
    if (!selected) return
    confirmAction(`Delete "${META[selected.type] || selected.type.replaceAll('_', ' ')}"? You can undo this from the toolbar.`, () => {
      const list = current.filter(section => section.id !== selected.id)
      const nextId = list[Math.max(0, selectedIndex - 1)]?.id || list[0]?.id || ''
      commit(withPage(list))
      setSelectedId(nextId)
      setDrawer(false)
    })
  }
  const duplicateSection = () => {
    if (!selected) return
    const copy = clone(selected)
    copy.id = makeId(selected.type)
    const list = [...current]
    list.splice(selectedIndex + 1, 0, copy)
    commit(withPage(list))
    setSelectedId(copy.id)
  }
  const moveSection = (delta: number) => {
    if (selectedIndex < 0) return
    const nextIndex = selectedIndex + delta
    if (nextIndex < 0 || nextIndex >= current.length) return
    const list = [...current]
    ;[list[selectedIndex], list[nextIndex]] = [list[nextIndex], list[selectedIndex]]
    commit(withPage(list))
  }
  const dropSection = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const from = current.findIndex(section => section.id === dragId)
    const to = current.findIndex(section => section.id === targetId)
    if (from < 0 || to < 0) return
    const list = [...current]
    const item = list.splice(from, 1)[0]
    list.splice(to, 0, item)
    commit(withPage(list))
    setDragId(null)
  }
  const undo = () => {
    const snapshot = history.at(-1)
    if (!snapshot) return
    setFuture(f => [...f, { theme: clone(theme), templates: clone(templates), page, selectedId }])
    setHistory(h => h.slice(0, -1))
    setTheme(snapshot.theme)
    setTemplates(snapshot.templates)
    setPage(snapshot.page)
    setSelectedId(snapshot.selectedId)
    setDirty(true)
  }
  const redo = () => {
    const snapshot = future.at(-1)
    if (!snapshot) return
    setHistory(h => [...h, { theme: clone(theme), templates: clone(templates), page, selectedId }])
    setFuture(f => f.slice(0, -1))
    setTheme(snapshot.theme)
    setTemplates(snapshot.templates)
    setPage(snapshot.page)
    setSelectedId(snapshot.selectedId)
    setDirty(true)
  }
  const switchPage = (key: string) => {
    if (key === page) return
    setPage(key)
    setSelectedId('')
    if (drawerMode === 'section') setDrawer(false)
  }
  const openCategory = (key: string) => {
    setActiveCategoryKey(key)
    setDrawerMode('theme')
    setDrawer(true)
  }
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const editorTemplates = { ...(theme.editorTemplates || {}), ...clone(templates) }
      const nextTheme = { ...theme, editorTemplates, editorTemplateKey: page }
      const response = await fetch('/api/admin/theme', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: nextTheme, sections: templates['Home page'] || [], editorTemplates, templateKey: page, navigation: initial.navigation }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save theme')
      setTheme(data.theme || nextTheme)
      setDirty(false)
      setHasDraft(true)
      setMessage('Theme saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save theme')
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    if (!hasDraft || publishing) return
    setPublishing(true)
    setPublishMessage('')
    setPublishError('')
    try {
      const response = await fetch('/api/admin/theme/publish', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to publish theme')
      setHasDraft(false)
      setPublishMessage('Published')
      window.setTimeout(() => setPublishMessage(''), 2500)
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Unable to publish theme')
      window.setTimeout(() => setPublishError(''), 4000)
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    if (sideTab !== 'history' || versions.length || versionsLoading) return
    setVersionsLoading(true)
    setVersionsError('')
    fetch('/api/admin/theme/versions', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => { if (Array.isArray(data.versions)) setVersions(data.versions); else throw new Error(data.error || 'Unable to load theme history') })
      .catch(error => setVersionsError(error instanceof Error ? error.message : 'Unable to load theme history'))
      .finally(() => setVersionsLoading(false))
  }, [sideTab, versions.length, versionsLoading])

  const restoreVersion = (id: string) => {
    confirmAction('Restore this version? It will replace your current draft (published content is unaffected until you publish again).', () => performRestore(id))
  }
  const performRestore = async (id: string) => {
    setRestoringId(id)
    setVersionsError('')
    try {
      const response = await fetch(`/api/admin/theme/versions/${id}/restore`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to restore theme version')
      setMessage('Version restored to draft — reloading…')
      window.setTimeout(() => window.location.reload(), 600)
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : 'Unable to restore theme version')
      setRestoringId(null)
    }
  }

  const formatVersionTime = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.round(diffMs / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  }

  const maxWidth = device === 'mobile' ? 390 : device === 'tablet' ? 820 : 1320
  const frameClass = device === 'mobile' ? styles.frameMobile : device === 'tablet' ? styles.frameTablet : styles.frameDesktop

  const categoryCtx: FieldCtx | null = activeCategory
    ? { s: activeCategory.group === ROOT_GROUP ? theme : (theme[activeCategory.group] || {}), products, collections }
    : null

  return (
    <div className={styles.editor}>
      <ThemeInspectorStyles />

      <header className={styles.top}>
        <div className={styles.topLeft}>
          <a className={styles.iconBtn} href="/admin/online-store">
            <ArrowLeft size={16} />
          </a>
          <div>
            <div className={styles.title}>Theme editor</div>
            <div className={styles.sub}>{PAGE_TABS.find(tab => tab.key === page)?.label || page}</div>
          </div>
        </div>
        <div className={styles.topRight}>
          <button className={styles.iconBtn} onClick={undo} disabled={!history.length} aria-label="Undo"><Undo2 size={15} /></button>
          <button className={styles.iconBtn} onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 size={15} /></button>
          <div className={styles.deviceGroup}>
            {(['desktop', 'tablet', 'mobile'] as const).map(item => (
              <button className={`${styles.iconBtn} ${device === item ? styles.active : ''}`} key={item} onClick={() => setDevice(item)} aria-label={item}>
                {item === 'desktop' ? <Monitor size={14} /> : item === 'tablet' ? <Tablet size={14} /> : <Smartphone size={14} />}
              </button>
            ))}
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!dirty || saving} onClick={save}>
            <Save size={14} />
            {saving ? 'Saving…' : dirty ? 'Save •' : 'Save'}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.side}>
          <div className={styles.tabs}>
            <button className={sideTab === 'sections' ? styles.active : ''} onClick={() => setSideTab('sections')}><GripVertical size={13} />Sections</button>
            <button className={sideTab === 'theme' ? styles.active : ''} onClick={() => setSideTab('theme')}><Palette size={13} />Theme</button>
            <button className={sideTab === 'history' ? styles.active : ''} onClick={() => setSideTab('history')}><History size={13} />History</button>
          </div>

          {sideTab === 'sections' ? (
            <>
              <div className={styles.pageTabs} role="tablist" aria-label="Page template">
                {PAGE_TABS.map(tab => (
                  <button key={tab.key} role="tab" aria-selected={page === tab.key} className={page === tab.key ? styles.active : ''} onClick={() => switchPage(tab.key)}>{tab.label}</button>
                ))}
              </div>
              <div className={styles.sideSectionsHead}>
                <div>
                  <strong>{isHome ? 'Homepage sections' : PAGE_ZONE_COPY[page]?.title}</strong>
                  <div className={styles.sideSectionsCount}>{current.filter(section => section.enabled !== false).length} visible sections</div>
                </div>
                <button className={styles.iconBtn} onClick={() => setPicker(true)} aria-label="Add section"><Plus size={15} /></button>
              </div>
              <div className={styles.legacyNotice}>
                {isHome
                  ? 'Every section below is live on your homepage, in this order -- drag to reorder, or use Add section to insert anything from banners to testimonials. Header and Announcement apply across your whole site, not just this page.'
                  : `${PAGE_ZONE_COPY[page]?.body} The page's own content -- ${page === 'Product' ? 'gallery, variants, add to cart, reviews' : page === 'Collection' ? 'filters, sorting and the product grid' : 'items, coupon, order summary and checkout'} -- is built in and always stays above it.`}
                {' '}Page-level options live under the Theme tab.
              </div>
              <div className={styles.rows}>
                {!current.length && <div className={styles.emptyZone}>Nothing added yet -- this page shows only its built-in content. Use Add section to put banners, testimonials, FAQs and more below it.</div>}
                {current.map(section => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDragId(section.id)}
                    onDragOver={event => { event.preventDefault(); if (dragId && dragId !== section.id) setDragOverId(section.id) }}
                    onDragLeave={() => setDragOverId(prev => (prev === section.id ? null : prev))}
                    onDrop={() => { dropSection(section.id); setDragOverId(null) }}
                    onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                    className={`${styles.row} ${selectedId === section.id && drawerMode === 'section' ? styles.active : ''} ${dragOverId === section.id && dragId !== section.id ? styles.dropTarget : ''}`}
                  >
                    <button className={styles.rowMain} onClick={() => { setSelectedId(section.id); setDrawerMode('section'); setDrawer(true); setDrawerTab('content') }}>
                      <GripVertical size={13} className={styles.rowGrip} />
                      {(() => { const Icon = SECTION_ICONS[section.type] || LayoutGrid; return <Icon size={15} className={styles.rowIcon} /> })()}
                      <span>{META[section.type] || section.type.replaceAll('_', ' ')}</span>
                      <small className={styles.liveTag}>LIVE</small>
                    </button>
                    <button className={styles.rowToggle} onClick={() => { setSelectedId(section.id); setDrawerMode('section'); setDrawer(true); toggleSection(section.enabled === false) }} aria-label={section.enabled === false ? 'Enable section' : 'Disable section'}>
                      {section.enabled === false ? <X size={14} /> : <Check size={14} />}
                    </button>
                  </div>
                ))}
              </div>
              <button className={styles.add} onClick={() => setPicker(true)}><Plus size={14} />Add section</button>
            </>
          ) : sideTab === 'theme' ? (
            <>
              <div className={styles.sideSectionsHead}>
                <div>
                  <strong>Theme settings</strong>
                  <div className={styles.sideSectionsCount}>Global — applies across your whole store</div>
                </div>
              </div>
              <div className={styles.rows}>
                {THEME_CATEGORIES.map(category => {
                  const Icon = category.icon
                  return (
                    <div key={category.key} className={`${styles.row} ${activeCategoryKey === category.key && drawerMode === 'theme' ? styles.active : ''}`}>
                      <button className={styles.rowMain} onClick={() => openCategory(category.key)}>
                        <Icon size={15} className={styles.rowIcon} />
                        <span>{category.label}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className={styles.sideSectionsHead}>
                <div>
                  <strong>Version history</strong>
                  <div className={styles.sideSectionsCount}>Every publish keeps a restorable snapshot</div>
                </div>
              </div>
              <div className={styles.rows}>
                {versionsLoading && <div className={styles.sideSectionsCount}>Loading history…</div>}
                {versionsError && <div className={styles.sideSectionsCount}>{versionsError}</div>}
                {!versionsLoading && !versionsError && !versions.length && <div className={styles.sideSectionsCount}>No published versions yet. History fills in after your next publish.</div>}
                {versions.map(version => (
                  <div className={styles.row} key={version.id}>
                    <div className={styles.rowMain}>
                      <History size={13} className={styles.rowIcon} />
                      <span>
                        {formatVersionTime(version.createdAt)}
                        {version.createdBy && <small className={styles.versionBy}> · {version.createdBy}</small>}
                      </span>
                    </div>
                    <button className={styles.rowToggle} disabled={restoringId === version.id} onClick={() => restoreVersion(version.id)} aria-label="Restore this version">
                      {restoringId === version.id ? '…' : <Undo2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className={styles.canvas}>
          <div className={styles.canvasBar}>
            <strong>{PAGE_TABS.find(tab => tab.key === page)?.label || page}</strong>
            <span className={styles.canvasBarStatus}>{dirty ? 'Live preview · unsaved changes' : 'Live preview'}</span>
          </div>
          <div className={styles.preview}>
            <iframe
              ref={iframeRef}
              title="Storefront preview"
              className={`${styles.frame} ${frameClass}`}
              style={{ maxWidth, height: previewHeight || '100%', border: 0 }}
            />
          </div>
        </main>

        {drawer && drawerMode === 'section' && selected && (
          <aside className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div>
                <div className={styles.drawerHeadLabel}>Section</div>
                <strong>{META[selected.type] || selected.type}</strong>
              </div>
              <div className={styles.drawerHeadActions}>
                <button className={styles.iconBtn} onClick={() => moveSection(-1)} disabled={selectedIndex <= 0} aria-label="Move up"><ArrowUp size={13} /></button>
                <button className={styles.iconBtn} onClick={() => moveSection(1)} disabled={selectedIndex < 0 || selectedIndex >= current.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                <button className={styles.iconBtn} onClick={duplicateSection} aria-label="Duplicate"><Copy size={13} /></button>
                <button className={styles.iconBtn} onClick={removeSection} aria-label="Delete"><Trash2 size={13} /></button>
                <button className={styles.iconBtn} onClick={() => setDrawer(false)} aria-label="Close"><X size={15} /></button>
              </div>
            </div>
            <div className={styles.drawerTabs}>
              {(['content', 'design', 'advanced'] as const).map(item => (
                <button key={item} className={drawerTab === item ? styles.active : ''} onClick={() => setDrawerTab(item)}>{item}</button>
              ))}
            </div>
            {drawerTab === 'content' ? (
              <SectionInspector section={selected} products={products} collections={collections} onUpdate={patch} onUpdateBlocks={patchBlocks} />
            ) : drawerTab === 'design' ? (
              <div className="themeInspector">
                <details className="themeInspectorPanel" open><summary>Design</summary><div>
                  <label className="themeInspectorField"><span>Section spacing</span><input type="number" value={selected.settings?.spacing ?? 72} onChange={event => patch({ spacing: Number(event.target.value) })} /></label>
                  <label className="themeInspectorField"><span>Content width</span><input type="number" value={selected.settings?.contentWidth ?? 1180} onChange={event => patch({ contentWidth: Number(event.target.value) })} /></label>
                </div></details>
              </div>
            ) : (
              <div className="themeInspector">
                <details className="themeInspectorPanel" open><summary>Advanced</summary><div>
                  <label className="themeInspectorToggle"><span>Show section</span><button type="button" className={selected.enabled !== false ? 'on' : ''} aria-pressed={selected.enabled !== false} onClick={() => toggleSection(selected.enabled === false)}><i /></button></label>
                  <label className="themeInspectorField"><span>Animation</span>
                    <select value={selected.settings?.animation || 'fade-up'} onChange={event => patch({ animation: event.target.value })}>
                      <option value="none">None</option>
                      <option value="fade-up">Fade up</option>
                      <option value="fade">Fade</option>
                      <option value="zoom">Zoom</option>
                    </select>
                  </label>
                </div></details>
              </div>
            )}
          </aside>
        )}

        {drawer && drawerMode === 'theme' && activeCategory && categoryCtx && (
          <aside className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div>
                <div className={styles.drawerHeadLabel}>Theme setting</div>
                <strong>{activeCategory.label}</strong>
              </div>
              <div className={styles.drawerHeadActions}>
                <button className={styles.iconBtn} onClick={() => setDrawer(false)} aria-label="Close"><X size={15} /></button>
              </div>
            </div>
            <div className="themeInspector">
              {activeCategory.panels.map(panel => renderPanel(panel, categoryCtx, patches => patchTheme(activeCategory.group, patches)))}
            </div>
          </aside>
        )}
      </div>

      {picker && (
        <div className={styles.pickerOverlay} onMouseDown={() => { setPicker(false); setPickerQuery('') }}>
          <div className={styles.pickerDialog} onMouseDown={event => event.stopPropagation()}>
            <strong className={styles.pickerTitle}>Add section</strong>
            <input
              className={styles.pickerSearch}
              value={pickerQuery}
              onChange={event => setPickerQuery(event.target.value)}
              placeholder="Search sections…"
              autoFocus
            />
            {(() => {
              const results = Object.entries(META)
                .filter(([key]) => (isHome ? !['announcement', 'header', 'main_product', 'main_collection_banner', 'main_collection_grid'].includes(key) : !ZONE_HIDDEN_TYPES.has(key)))
                .filter(([, label]) => label.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
              if (!results.length) return <div className={styles.pickerEmpty}>No sections match &ldquo;{pickerQuery}&rdquo;.</div>
              return (
                <div className={styles.pickerList}>
                  {results.map(([key, label]) => {
                    const Icon = SECTION_ICONS[key] || LayoutGrid
                    return (
                      <button key={key} className={styles.pickerCard} onClick={() => addSection(key)}>
                        <span className={styles.pickerIcon}><Icon size={20} /></span>
                        <span className={styles.pickerLabel}>{label}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {confirmState && (
        <div className={styles.pickerOverlay} onMouseDown={() => setConfirmState(null)}>
          <div className={styles.confirmDialog} onMouseDown={event => event.stopPropagation()}>
            <p className={styles.confirmMessage}>{confirmState.message}</p>
            <div className={styles.confirmActions}>
              <button className={styles.btn} onClick={() => setConfirmState(null)}>Cancel</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  const action = confirmState.onConfirm
                  setConfirmState(null)
                  action()
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {message && <div className={styles.notice}>{message}</div>}

      <ThemePublishBar draft={hasDraft} publishing={publishing} message={publishMessage} error={publishError} onPublish={publish} />
    </div>
  )
}
