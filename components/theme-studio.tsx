'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AtSign,
  BadgeCheck,
  Eye,
  PanelLeft,
  EyeOff,
  UploadCloud,
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
  Tag,
  PackagePlus,
  Rows3,
  MessageCircle,
  Truck,
  BadgePercent,
} from 'lucide-react'
import SectionInspector, {
  renderPanel,
  text, image, textarea, select, toggle, range, color, deliveryAreas,
  type PanelSchema, type FieldCtx,
} from '@/components/theme-section-inspector'
import ThemeInspectorStyles from '@/components/theme-inspector-styles'
import { FONT_OPTIONS } from '@/lib/font-options'
import { mergeLegacyStrips, type LegacyBlock } from '@/lib/home-strips'
import PageSeoPanel from '@/components/page-seo-panel'
import { SECTION_PRESETS, type SectionPreset } from '@/lib/section-presets'
import { isPageTemplateKey, pageIdFromKey, pageTemplateKey } from '@/lib/custom-pages'
import styles from './theme-studio.module.css'
import { marketHomeSections, marketSectionDefaults } from '@/lib/storefront-market'

// Deliberately not under /admin -- see app/theme-editor-preview/page.tsx's top comment.
const PREVIEW_PATH = '/theme-editor-preview'

type AnyMap = Record<string, any>
type Section = { id: string; type: string; enabled?: boolean; settings?: AnyMap; blocks?: AnyMap[] }
type PageRow = { id: string; title: string; handle: string; bodyHtml: string | null; status: string; seoTitle?: string | null; seoDescription?: string | null }
type Snapshot = { theme: AnyMap; templates: Record<string, Section[]>; page: string; selectedId: string }
type Props = { initial: { theme: AnyMap; sections: Section[]; navigation: any[]; draft: boolean; legacyBlocks?: LegacyBlock[]; openPage?: string; openSettings?: string; products?: any[]; collections?: any[]; dataError?: string } }

// The four page templates the editor manages. Home is a full section builder;
// the other three append a merchant-editable content zone below that page's own
// built-in commerce UI (product purchase flow, shop/collection listing, cart
// and checkout handoff), which this editor deliberately never touches.
const PAGE_TABS = [
  { key: 'Home page', label: 'Home' },
  { key: 'Product', label: 'Product' },
  { key: 'Collection', label: 'Collection & shop' },
  { key: 'Cart', label: 'Cart' },
  { key: 'BlogPages', label: 'Blog' },
]
const PAGES = PAGE_TABS.map(tab => tab.key)
// Structural entries kept in a zone page's stored template (header/announcement
// are read by store-nav-fixed.tsx, main_* are the placeholders lib/theme.ts's
// repairTemplate looks for) that must never show up as editable rows -- they
// don't render as content, so listing them would be decoration again.
const ZONE_HIDDEN_TYPES = new Set(['header', 'announcement', 'footer', 'main_product', 'main_collection_banner', 'main_collection_grid'])
// Shopify-style structure of the Home list: Header (site-wide announcement + header,
// always first and not reorderable), Page content (everything the homepage is built
// from -- drag to reorder, add, duplicate, delete), Footer (always last). Only page
// content ever moves, so reordering can never push a section past the header/footer.
const isTopSection = (section: Section) => section.type === 'header' || section.type === 'announcement'
const isFooterSection = (section: Section) => section.type === 'footer'
const isContentSection = (section: Section) => !isTopSection(section) && !isFooterSection(section)
const PAGE_ZONE_COPY: Record<string, { title: string; body: string }> = {
  Product: { title: 'Product page content', body: 'Sections you add appear below the product, its reviews and recommendations on every product page.' },
  Collection: { title: 'Collection & shop content', body: 'Sections you add appear below the product listing on /shop and every collection page.' },
  Cart: { title: 'Cart page content', body: 'Sections you add appear below the cart and its recommendations.' },
  BlogPages: { title: 'Blog content', body: 'Sections you add appear below the blog list and below every article.' },
}
// What each built-in page already shows, for the note that sits under the page tabs.
const PAGE_OWN_CONTENT: Record<string, string> = {
  Product: 'gallery, variants, add to cart, reviews',
  Collection: 'filters, sorting and the product grid',
  Cart: 'items, coupon, order summary and checkout',
  BlogPages: 'the list of posts, or the article itself',
}
// Header and Announcement are read globally by the storefront nav, independent
// of which page you're viewing.
// Only the two site-wide rows (header, announcement) are guaranteed to exist: the storefront
// reads them globally, so they must always be configurable here. Content sections are only
// rendered if they are in the list, so a deleted one stays deleted. (Re-adding the six
// AliExpress-style sections on every load used to bring deleted ones back.)
const sanitizeHomeSections = (list: Section[]) => {
  const present = new Set(list.map(section => section.type))
  const backfilled = [...list]
  for (const type of ['header', 'announcement']) if (!present.has(type)) backfilled.push(sectionDefaults(type))
  return backfilled
}
const META: Record<string, string> = {
  hero_slider: 'Hero slider',
  offer_banners: 'Offer banners',
  product_tabs: 'Product tabs (deals / best sellers / new)',
  product_rail: 'Product row',
  category_spotlight: 'Category spotlight',
  shop_by_price: 'Shop by price',
  recently_viewed: 'Recently viewed',
  bundles: 'Bundle & save',
  announcement: 'Announcement bar',
  announcement_strip: 'Announcement strip',
  trust_strip: 'Trust strip',
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
  hero_slider: Images,
  offer_banners: SplitSquareHorizontal,
  product_tabs: BadgePercent,
  product_rail: GalleryHorizontalEnd,
  category_spotlight: PanelTop,
  shop_by_price: Tag,
  recently_viewed: History,
  bundles: PackagePlus,
  announcement: Megaphone,
  announcement_strip: Megaphone,
  trust_strip: ShieldCheck,
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
  if (type === 'announcement_strip') return { id: makeId(type), type, enabled: true, settings: {}, blocks: [{ id: makeId('message'), type: 'message', settings: { text: 'Free delivery on qualifying orders.', link: '' } }] }
  if (type === 'trust_strip') return { id: makeId(type), type, enabled: true, settings: {}, blocks: [
    { id: makeId('trust_item'), type: 'trust_item', settings: { heading: 'Free shipping', text: 'On qualifying orders' } },
    { id: makeId('trust_item'), type: 'trust_item', settings: { heading: 'Secure checkout', text: 'Your order is protected' } },
    { id: makeId('trust_item'), type: 'trust_item', settings: { heading: 'Easy returns', text: 'Hassle-free, within 30 days' } },
  ] }
  const market = marketSectionDefaults(type)
  if (market) return { id: makeId(type), type, enabled: true, settings: clone(market.settings), blocks: (market.blocks || []).map((b: any) => ({ ...clone(b), id: makeId(b.type) })) }
  if (type === 'category_strip') return { id: makeId(type), type, enabled: true, settings: { heading: 'Shop by category', limit: 12 } }
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
  const liveDefaults = [sectionDefaults('announcement'), sectionDefaults('header'), ...(marketHomeSections() as Section[]).map(section => ({ ...section, id: makeId(section.type) }))]
  const sanitized = source?.length ? sanitizeHomeSections(clone(source)) : []
  const home = sanitized.length ? sanitized : liveDefaults
  return {
    'Home page': home,
    // Empty on purpose: these three are addable zones, so a store that has
    // never added anything must render nothing extra (see lib/theme.ts).
    Product: [],
    Collection: [],
    Cart: [],
    BlogPages: [],
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
    { title: 'Header', fields: [toggle('Show wishlist icon', 'showWishlist', false), toggle('Transparent header (older design only)', 'transparent', false), toggle('Transparent on homepage only (older design only)', 'transparentHome', false)] },
    { title: 'Header style', fields: [
      select('Header background', 'style', [{ value: 'light', label: 'White (logo in its own colours)' }, { value: 'brand', label: 'Brand colour' }], 'light'),
      color('Header colour (brand colour style)', 'background', '#d7261e'),
      toggle('Brand colour style: show the logo in solid white (off: use the dark-background logo as it is)', 'whiteLogo', true),
      text('Search box hint', 'searchPlaceholder', 'Search products…'),
      toggle('Show category tabs under the header (your Navigation menu)', 'showCategoryTabs', true),
    ] },
  ] },
  { key: 'delivery', label: 'Delivery bar', icon: Truck, group: 'delivery', panels: [
    { title: 'Delivery bar', fields: [
      toggle('Show the delivery bar under the header', 'enabled', true),
      deliveryAreas('Delivery areas and times', 'areas'),
      [text('Label', 'label', 'Delivering to'), text('Time label', 'etaLabel', 'Delivery')],
      text('Note (computers only)', 'note', 'Cash on delivery'),
    ] },
  ] },
  { key: 'whatsapp', label: 'WhatsApp button', icon: MessageCircle, group: 'whatsapp', panels: [
    { title: 'Floating WhatsApp button', fields: [
      toggle('Show the WhatsApp button on every page', 'enabled', false),
      text('WhatsApp number (empty = the phone in Settings › Store contact)', 'number', '+961 70 000 000'),
      textarea('Message typed for the shopper', 'message'),
      text('Button text on computers (empty = icon only)', 'label', 'Chat with us'),
      select('Side', 'position', [{ value: 'right', label: 'Bottom right' }, { value: 'left', label: 'Bottom left' }], 'right'),
      toggle('Show on phones', 'showOnMobile', true),
    ] },
  ] },
  { key: 'productCardMarket', label: 'Product cards', icon: Rows3, group: 'productCardMarket', panels: [
    { title: 'Product cards', fields: [
      text('Line under the price (empty = hide)', 'deliveryText', 'Cash on delivery'),
      toggle('Show the Add to cart button', 'showAddToCart', true),
    ] },
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
// How the Theme tab groups its categories (display only; order here is the order shown).
const THEME_GROUPS: { label: string; hint: string; keys: string[] }[] = [
  { label: 'Store', hint: 'Name, logo, links', keys: ['branding', 'social'] },
  { label: 'Pages & layout', hint: 'Header, footer, page options', keys: ['header', 'delivery', 'whatsapp', 'productCardMarket', 'footer', 'productPage', 'collectionPage', 'cart'] },
  { label: 'Look & feel', hint: 'Applies everywhere', keys: ['colors', 'typography', 'buttons', 'cards', 'layout'] },
]

export default function ThemeStudio({ initial }: Props) {
  const fallback = useMemo(() => defaultTemplates(initial.sections), [initial.sections])
  // Computed once. If this store still has the old admin "Content" announcement/trust rows
  // (and hasn't been migrated yet), they become sections here and the theme is flagged so
  // the live homepage stops rendering the old rows once this is saved and published.
  const initialState = useMemo(() => {
    const stored = initial.theme?.editorTemplates || {}
    const base = clone(fallback)
    for (const key of PAGES) if (Array.isArray(stored[key]) && stored[key].length) base[key] = clone(stored[key])
    // One template per custom page (Online Store > Pages) that has been designed here.
    for (const key of Object.keys(stored)) if (isPageTemplateKey(key) && Array.isArray(stored[key])) base[key] = clone(stored[key])
    base['Home page'] = sanitizeHomeSections(base['Home page'])
    if (!base['Home page'].length) base['Home page'] = clone(fallback['Home page'])
    let migrated = false
    if (!initial.theme?.legacyHomeBlocksMigrated && initial.legacyBlocks?.length) {
      base['Home page'] = mergeLegacyStrips(base['Home page'], initial.legacyBlocks).sections
      migrated = true
    }
    return { templates: base as Record<string, Section[]>, migrated }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [theme, setTheme] = useState<AnyMap>(() => {
    const next = clone(initial.theme || {})
    if (initialState.migrated) next.legacyHomeBlocksMigrated = true
    return next
  })
  const [templates, setTemplates] = useState<Record<string, Section[]>>(() => initialState.templates)
  const [page, setPage] = useState(() => (initial.openPage ? pageTemplateKey(initial.openPage) : 'Home page'))
  const [pages, setPages] = useState<PageRow[]>([])
  const [blogPosts, setBlogPosts] = useState<any[]>([])
  const [pagesTab, setPagesTab] = useState(() => Boolean(initial.openPage))
  const [newPageTitle, setNewPageTitle] = useState<string | null>(null)
  const [pageBusy, setPageBusy] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [sideTab, setSideTab] = useState<'sections' | 'theme' | 'history'>(THEME_CATEGORIES.some(c => c.key === initial.openSettings) ? 'theme' : 'sections')
  // ?settings=<key> (e.g. delivery, linked from Shipping) opens that Theme settings panel.
  const startCategory = THEME_CATEGORIES.some(c => c.key === initial.openSettings) ? initial.openSettings! : ''
  const [activeCategoryKey, setActiveCategoryKey] = useState(startCategory)
  const [drawerMode, setDrawerMode] = useState<'section' | 'theme'>(startCategory ? 'theme' : 'section')
  const [drawerTab, setDrawerTab] = useState<'content' | 'design' | 'advanced'>('content')
  const [drawer, setDrawer] = useState(Boolean(startCategory))
  const [picker, setPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerTab, setPickerTab] = useState<'sections' | 'presets'>('sections')
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(initialState.migrated)
  const [saving, setSaving] = useState(false)
  // Phones show one pane at a time (section list or preview); wider screens show both.
  const [mobileView, setMobileView] = useState<'sections' | 'preview'>('sections')
  const [message, setMessage] = useState(initialState.migrated ? 'Your homepage announcement bar and trust strip are now sections below. Save and publish to apply.' : '')
  const [saveError, setSaveError] = useState('')
  const [dataError, setDataError] = useState(initial.dataError || '')
  const [messageIsError, setMessageIsError] = useState(false)
  // Loaded on the server with the page (same request that loads the theme), so the pickers
  // and the preview never depend on a second request from the browser.
  const [products, setProducts] = useState<any[]>(initial.products || [])
  const [collections, setCollections] = useState<any[]>(initial.collections || [])
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
  // The toast used to stay on screen until the next action; it now clears itself, and
  // failures stay up longer than confirmations so they can be read.
  const flash = (text: string, isError = false) => { setMessageIsError(isError); setMessage(text) }
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => { setMessage(''); setMessageIsError(false) }, messageIsError ? 8000 : 4500)
    return () => window.clearTimeout(timer)
  }, [message, messageIsError])
  const [hasDraft, setHasDraft] = useState(initial.draft)
  const [publishing, setPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishError, setPublishError] = useState('')

  const isHome = page === 'Home page'
  const isCustomPage = isPageTemplateKey(page)
  const onPagesTab = isCustomPage || pagesTab
  const activePage = isCustomPage ? pages.find(row => row.id === pageIdFromKey(page)) || null : null
  const pageLabel = isCustomPage ? activePage?.title || 'Page' : PAGE_TABS.find(tab => tab.key === page)?.label || page
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
    // Only the published posts, newest first, as sample content for the Blog preview.
    fetch('/api/admin/blog-posts', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).then(data => setBlogPosts(rows(data).filter((post: any) => post.status === 'PUBLISHED').slice(0, 6))).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/admin/pages', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).then(data => setPages(rows(data))).catch(() => {})
  }, [])

  useEffect(() => {
    // Fallback only: the page normally hands products and collections over already
    // (initial.products / initial.collections, loaded on the server with the theme). If the
    // server couldn't load them, try the API once more and, if that fails too, show every
    // reason in the pickers so the failure is never mistaken for an empty store.
    if (initial.products && !initial.dataError) return
    const reasons: string[] = initial.dataError ? [`server: ${initial.dataError}`] : []
    const reason = (label: string) => async (r: Response) => {
      if (r.ok) return r.json()
      const body = await r.json().catch(() => ({}))
      throw new Error(`${label} ${r.status}${body?.error ? ` ${body.error}` : ''}`)
    }
    fetch('/api/admin/theme/preview-data', { cache: 'no-store' })
      .then(reason('preview data'))
      .then(data => ({ products: rows(data.products), collections: rows(data.collections) }))
      .catch(error => {
        reasons.push(error instanceof Error ? error.message : String(error))
        return Promise.all([
          fetch('/api/products', { cache: 'no-store' }).then(reason('products')),
          fetch('/api/admin/collections', { cache: 'no-store' }).then(reason('collections')),
        ]).then(([productData, collectionData]) => ({ products: rows(productData), collections: rows(collectionData).filter((collection: any) => collection.isActive !== false) }))
      })
      .then(({ products, collections }) => { setProducts(products); setCollections(collections); setDataError('') })
      .catch(error => {
        reasons.push(error instanceof Error ? error.message : String(error))
        setDataError(reasons.join('; '))
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
      pageInfo: activePage ? { title: activePage.title, bodyHtml: activePage.bodyHtml } : null,
      blogPosts: page === 'BlogPages' ? blogPosts : [],
      theme,
      sections: current,
      navigation: initial.navigation,
      products,
      collections,
      selectedId,
    }, window.location.origin)
  }, [previewReadyToken, page, activePage, blogPosts, theme, current, initial.navigation, products, collections, selectedId])

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
  // Right after the selected content section; otherwise at the end of the page content
  // (never inside the header group or after the footer).
  const insertionIndex = (list: Section[]) => {
    const lastContent = list.reduce((last, section, index) => (isContentSection(section) ? index : last), -1)
    const firstAfterTop = list.findIndex(section => !isTopSection(section))
    return selected && isContentSection(selected) ? selectedIndex + 1 : lastContent >= 0 ? lastContent + 1 : firstAfterTop < 0 ? list.length : firstAfterTop
  }
  const closePicker = () => { setPicker(false); setPickerQuery('') }
  // An empty page starts on the ready-made tab: the fastest way to a first draft.
  const openPicker = () => { setPickerTab(current.some(isContentSection) ? 'sections' : 'presets'); setPicker(true) }
  const addSection = (type: string) => {
    const next = sectionDefaults(type)
    const list = [...current]
    list.splice(insertionIndex(list), 0, next)
    commit(withPage(list))
    setSelectedId(next.id)
    setDrawerMode('section')
    setDrawer(true)
    closePicker()
  }
  // A preset adds several sections in one step (a single undo removes the whole group).
  const addPreset = (preset: SectionPreset) => {
    const made = preset.items.map(item => {
      const base = sectionDefaults(item.type)
      return {
        ...base,
        settings: { ...(base.settings || {}), ...(item.settings || {}) },
        blocks: item.blocks ? item.blocks.map(block => ({ id: makeId(block.type), type: block.type, settings: { ...block.settings } })) : base.blocks,
      } as Section
    })
    const list = [...current]
    list.splice(insertionIndex(list), 0, ...made)
    commit(withPage(list))
    // Select the last section so the next addition lands after the whole group, not inside it.
    setSelectedId(made[made.length - 1].id)
    flash(`Added “${preset.label}” (${made.length} section${made.length === 1 ? '' : 's'}). Undo removes it all.`)
    closePicker()
  }
  const removeSection = () => {
    if (!selected || !isContentSection(selected)) return
    confirmAction(`Delete "${META[selected.type] || selected.type.replaceAll('_', ' ')}"? You can undo this from the toolbar.`, () => {
      const list = current.filter(section => section.id !== selected.id)
      const nextId = list[Math.max(0, selectedIndex - 1)]?.id || list[0]?.id || ''
      commit(withPage(list))
      setSelectedId(nextId)
      setDrawer(false)
    })
  }
  const duplicateSection = () => {
    if (!selected || !isContentSection(selected)) return
    const copy = clone(selected)
    copy.id = makeId(selected.type)
    const list = [...current]
    list.splice(selectedIndex + 1, 0, copy)
    commit(withPage(list))
    setSelectedId(copy.id)
  }
  // Position of a section among the movable (page content) sections, for Move up/down.
  const contentIndexes = current.reduce<number[]>((acc, section, index) => (isContentSection(section) ? [...acc, index] : acc), [])
  const contentPos = contentIndexes.indexOf(selectedIndex)
  const moveSection = (delta: number) => {
    const target = contentIndexes[contentPos + delta]
    if (contentPos < 0 || target === undefined) return
    const list = [...current]
    ;[list[selectedIndex], list[target]] = [list[target], list[selectedIndex]]
    commit(withPage(list))
  }
  const dropSection = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    if (!current.some(section => section.id === dragId && isContentSection(section)) || !current.some(section => section.id === targetId && isContentSection(section))) return
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
    setPagesTab(isPageTemplateKey(key))
    setPage(key)
    setSelectedId('')
    if (drawerMode === 'section') setDrawer(false)
  }
  const openPagesTab = () => {
    setPagesTab(true)
    const first = isCustomPage ? null : pages[0]
    if (first) switchPage(pageTemplateKey(first.id))
  }
  const createPage = async () => {
    const title = (newPageTitle || '').trim()
    if (!title || pageBusy) return
    setPageBusy(true)
    try {
      const response = await fetch('/api/admin/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, status: 'DRAFT' }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to create page')
      setPages(list => [data.page, ...list])
      setNewPageTitle(null)
      switchPage(pageTemplateKey(data.page.id))
      flash(`Page created as a draft. Build it below; make it visible when it's ready.`)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Unable to create page', true)
    } finally { setPageBusy(false) }
  }
  const setPageStatus = async (status: 'PUBLISHED' | 'DRAFT') => {
    if (!activePage || pageBusy) return
    setPageBusy(true)
    try {
      const response = await fetch('/api/admin/pages', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: activePage.id, status }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update page')
      setPages(list => list.map(row => (row.id === activePage.id ? { ...row, status: data.page?.status || status } : row)))
      flash(status === 'PUBLISHED' ? 'Page is visible to visitors (publish your theme to show its sections).' : 'Page hidden from visitors.')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Unable to update page', true)
    } finally { setPageBusy(false) }
  }
  const openCategory = (key: string) => {
    setActiveCategoryKey(key)
    setDrawerMode('theme')
    setDrawer(true)
  }
  const save = async (): Promise<boolean> => {
    setSaving(true)
    setMessage('')
    setSaveError('')
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
      flash('Draft saved')
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to save theme'
      setSaveError(`Couldn't save: ${reason}`)
      flash(`Couldn't save your changes: ${reason}. They are still here -- try again.`, true)
      return false
    } finally {
      setSaving(false)
    }
  }

  // `force` is for publishAll below: it has just saved, but this closure still holds the
  // pre-save hasDraft, which would make a first-ever publish bail out.
  const publish = async (force = false) => {
    if ((!hasDraft && !force) || publishing) return
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

  // Publish always publishes what's on screen: if there are unsaved edits it saves them
  // first. Publishing alone would push the previously saved draft and silently leave the
  // latest edits behind.
  const publishAll = async () => {
    if (publishing || saving) return
    if (dirty && !(await save())) return
    await publish(true)
  }

  // Leaving with unsaved edits asks first (closing the tab, reloading, the back arrow).
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes -- except while
  // typing in a field, where the browser's own text undo must keep working.
  const shortcutRef = useRef({ save, undo, redo, dirty })
  shortcutRef.current = { save, undo, redo, dirty }
  useEffect(() => {
    const run = (key: string, shift: boolean, typing: boolean) => {
      if (key === 's') { if (shortcutRef.current.dirty) void shortcutRef.current.save(); return true }
      if (typing) return false
      if (key === 'z') { if (shift) shortcutRef.current.redo(); else shortcutRef.current.undo(); return true }
      if (key === 'y') { shortcutRef.current.redo(); return true }
      return false
    }
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (run(event.key.toLowerCase(), event.shiftKey, typing)) event.preventDefault()
    }
    // The preview is a separate document, so keys pressed while focus is inside it
    // never reach this window; theme-preview-frame.tsx forwards the same three shortcuts.
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (data?.source === 'theme-preview' && data.type === 'shortcut') run(String(data.key), !!data.shift, false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('message', onMessage) }
  }, [])

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
      flash('Version restored to draft — reloading…')
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
            <div className={styles.sub}>{pageLabel}</div>
          </div>
        </div>
        <div className={styles.topRight}>
          <button className={styles.iconBtn} onClick={undo} disabled={!history.length} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)"><Undo2 size={15} /></button>
          <button className={styles.iconBtn} onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)"><Redo2 size={15} /></button>
          <div className={styles.deviceGroup}>
            {(['desktop', 'tablet', 'mobile'] as const).map(item => (
              <button className={`${styles.iconBtn} ${device === item ? styles.active : ''}`} key={item} onClick={() => setDevice(item)} aria-label={item}>
                {item === 'desktop' ? <Monitor size={14} /> : item === 'tablet' ? <Tablet size={14} /> : <Smartphone size={14} />}
              </button>
            ))}
          </div>
          <span className={`${styles.saveStatus} ${publishError || (saveError && dirty) ? styles.saveStatusError : ''}`} role="status" aria-live="polite">
            {publishError || (saveError && dirty && !saving && !publishing ? saveError : null) || (publishing ? 'Publishing…' : saving ? 'Saving…' : dirty ? 'Unsaved changes' : publishMessage || (hasDraft ? 'Saved — not published yet' : 'Published'))}
          </span>
          <button className={styles.btn} disabled={!dirty || saving || publishing} onClick={save} title="Save draft (Ctrl/Cmd+S)">
            <Save size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={(!hasDraft && !dirty) || saving || publishing} onClick={publishAll} title="Publish to your live store">
            <UploadCloud size={14} />
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>

      <div className={`${styles.body} ${mobileView === 'preview' ? styles.showPreview : styles.showSections}`}>
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
                  <button key={tab.key} role="tab" aria-selected={!onPagesTab && page === tab.key} className={!onPagesTab && page === tab.key ? styles.active : ''} onClick={() => switchPage(tab.key)}>{tab.label}</button>
                ))}
                <button role="tab" aria-selected={onPagesTab} className={onPagesTab ? styles.active : ''} onClick={openPagesTab}>Pages</button>
              </div>
              {onPagesTab && (
                <div className={styles.pagePicker}>
                  <div className={styles.pagePickerRow}>
                    <select value={isCustomPage ? page : ''} onChange={event => event.target.value && switchPage(event.target.value)} aria-label="Page to design" disabled={!pages.length}>
                      {!isCustomPage && <option value="">{pages.length ? 'Choose a page…' : 'No pages yet'}</option>}
                      {pages.map(row => <option key={row.id} value={pageTemplateKey(row.id)}>{row.title}{row.status === 'PUBLISHED' ? '' : ' (draft)'}</option>)}
                    </select>
                    <button className={styles.btn} onClick={() => setNewPageTitle(newPageTitle === null ? '' : null)}><Plus size={13} />New page</button>
                  </div>
                  {newPageTitle !== null && (
                    <div className={styles.pagePickerRow}>
                      <input autoFocus value={newPageTitle} onChange={event => setNewPageTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createPage() }} placeholder="Page name, e.g. Summer sale" maxLength={120} aria-label="New page name" />
                      <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!newPageTitle.trim() || pageBusy} onClick={() => void createPage()}>Create</button>
                    </div>
                  )}
                  {activePage && (
                    <div className={styles.pagePickerRow}>
                      <span className={`${styles.pageStatus} ${activePage.status === 'PUBLISHED' ? styles.pageStatusLive : ''}`}>{activePage.status === 'PUBLISHED' ? 'Visible' : 'Draft'}</span>
                      <button className={styles.btn} disabled={pageBusy} onClick={() => void setPageStatus(activePage.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')}>{activePage.status === 'PUBLISHED' ? 'Hide page' : 'Make visible'}</button>
                      {activePage.status === 'PUBLISHED' && <a className={styles.pageLink} href={`/${activePage.handle}`} target="_blank" rel="noreferrer">View</a>}
                    </div>
                  )}
                  {activePage && <PageSeoPanel page={activePage} onSaved={row => setPages(list => list.map(item => (item.id === row.id ? { ...item, ...row } : item)))} />}
                </div>
              )}
              <div className={styles.sideSectionsHead}>
                <div>
                  <strong>{isHome ? 'Homepage sections' : isCustomPage ? (activePage?.title || 'Page') : onPagesTab ? 'Pages' : PAGE_ZONE_COPY[page]?.title}</strong>
                  <div className={styles.sideSectionsCount}>{current.filter(section => section.enabled !== false).length} visible sections</div>
                </div>
                <button className={styles.iconBtn} onClick={openPicker} aria-label="Add section"><Plus size={15} /></button>
              </div>
              <div className={styles.legacyNotice}>
                {isHome
                  ? 'Everything under Page content is live on your homepage, in this order. Header and Footer apply across the whole site.'
                  : onPagesTab
                    ? (isCustomPage
                      ? `Build this page from sections -- banners, product lists, collection lists, FAQs and more. ${activePage && activePage.status !== 'PUBLISHED' ? 'It is a draft: visitors cannot see it until you click Make visible.' : 'Changes go live when you publish.'}`
                      : 'Pick a page above, or create a new one, then build it from the same sections as your homepage.')
                    : <>{`${PAGE_ZONE_COPY[page]?.body} The page's own content -- ${PAGE_OWN_CONTENT[page] || 'its built-in content'} -- is built in and always stays above it.`}{' '}Page-level options live under the Theme tab.</>}
              </div>
              <div className={styles.rows}>
                {onPagesTab && !isCustomPage ? <div className={styles.emptyZone}>{pages.length ? 'Choose a page above to start designing it.' : 'You have no pages yet. Create one above, for example “Summer sale”, then add banners, products and collections to it.'}</div> : (() => {
                  const renderRow = (section: Section, movable: boolean) => (
                    <div
                      key={section.id}
                      draggable={movable}
                      onDragStart={movable ? () => setDragId(section.id) : undefined}
                      onDragOver={movable ? event => { event.preventDefault(); if (dragId && dragId !== section.id) setDragOverId(section.id) } : undefined}
                      onDragLeave={movable ? () => setDragOverId(prev => (prev === section.id ? null : prev)) : undefined}
                      onDrop={movable ? () => { dropSection(section.id); setDragOverId(null) } : undefined}
                      onDragEnd={movable ? () => { setDragId(null); setDragOverId(null) } : undefined}
                      className={`${styles.row} ${(section.type === 'footer' ? drawerMode === 'theme' && activeCategoryKey === 'footer' : selectedId === section.id && drawerMode === 'section') ? styles.active : ''} ${dragOverId === section.id && dragId !== section.id ? styles.dropTarget : ''} ${section.enabled === false ? styles.rowOff : ''}`}
                    >
                      <button className={styles.rowMain} onClick={() => { if (section.type === 'footer') { openCategory('footer'); return } setSelectedId(section.id); setDrawerMode('section'); setDrawer(true); setDrawerTab('content') }}>
                        {movable ? <GripVertical size={13} className={styles.rowGrip} /> : <span className={styles.rowGripSpacer} />}
                        {(() => { const Icon = SECTION_ICONS[section.type] || LayoutGrid; return <Icon size={15} className={styles.rowIcon} /> })()}
                        <span>{META[section.type] || section.type.replaceAll('_', ' ')}</span>
                      </button>
                      {section.type !== 'footer' && <button className={styles.rowToggle} onClick={() => { setSelectedId(section.id); setDrawerMode('section'); setDrawer(true); toggleSection(section.enabled === false) }} aria-label={section.enabled === false ? 'Show section' : 'Hide section'} title={section.enabled === false ? 'Hidden -- click to show' : 'Visible -- click to hide'}>
                        {section.enabled === false ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>}
                    </div>
                  )
                  const top = current.filter(isTopSection)
                  const content = current.filter(isContentSection)
                  const footer = current.filter(isFooterSection)
                  return (
                    <>
                      {isHome && top.length > 0 && <>
                        <div className={styles.groupLabel}><span>Header</span><small>Whole site</small></div>
                        {top.map(section => renderRow(section, false))}
                      </>}
                      {isHome && <div className={styles.groupLabel}><span>Page content</span><small>Drag to reorder</small></div>}
                      {!content.length && <div className={styles.emptyZone}>{isHome ? 'No sections yet.' : isCustomPage ? 'This page is empty.' : 'Nothing added yet -- this page shows only its built-in content.'} Use Add section to put banners, products, testimonials, FAQs and more {isHome ? 'on your homepage' : isCustomPage ? 'on this page' : 'below it'}.</div>}
                      {content.map(section => renderRow(section, true))}
                      <button className={styles.add} onClick={openPicker}><Plus size={14} />Add section</button>
                      {isHome && footer.length > 0 && <>
                        <div className={styles.groupLabel}><span>Footer</span><small>Edit under Theme settings</small></div>
                        {footer.map(section => renderRow(section, false))}
                      </>}
                    </>
                  )
                })()}
              </div>
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
                {THEME_GROUPS.map(group => (
                  <Fragment key={group.label}>
                    <div className={styles.groupLabel}><span>{group.label}</span><small>{group.hint}</small></div>
                    {group.keys.map(key => THEME_CATEGORIES.find(c => c.key === key)).filter((c): c is ThemeCategory => !!c).map(category => {
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
                  </Fragment>
                ))}
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
            <strong>{pageLabel}</strong>
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
                {selected && isContentSection(selected) && <>
                  <button className={styles.iconBtn} onClick={() => moveSection(-1)} disabled={contentPos <= 0} aria-label="Move up"><ArrowUp size={13} /></button>
                  <button className={styles.iconBtn} onClick={() => moveSection(1)} disabled={contentPos < 0 || contentPos >= contentIndexes.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                  <button className={styles.iconBtn} onClick={duplicateSection} aria-label="Duplicate"><Copy size={13} /></button>
                  <button className={styles.iconBtn} onClick={removeSection} aria-label="Delete"><Trash2 size={13} /></button>
                </>}
                <button className={styles.iconBtn} onClick={() => setDrawer(false)} aria-label="Close"><X size={15} /></button>
              </div>
            </div>
            <div className={styles.drawerTabs}>
              {(['content', 'design', 'advanced'] as const).map(item => (
                <button key={item} className={drawerTab === item ? styles.active : ''} onClick={() => setDrawerTab(item)}>{item}</button>
              ))}
            </div>
            {drawerTab === 'content' ? (
              <SectionInspector section={selected} products={products} collections={collections} loadError={dataError} onUpdate={patch} onUpdateBlocks={patchBlocks} />
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
            <strong className={styles.pickerTitle}>Add to this page</strong>
            <div className={styles.pickerTabs} role="tablist">
              <button role="tab" aria-selected={pickerTab === 'sections'} className={pickerTab === 'sections' ? styles.active : ''} onClick={() => setPickerTab('sections')}>Sections</button>
              <button role="tab" aria-selected={pickerTab === 'presets'} className={pickerTab === 'presets' ? styles.active : ''} onClick={() => setPickerTab('presets')}>Ready-made</button>
            </div>
            {pickerTab === 'presets' ? (
              <div className={styles.presetList}>
                {SECTION_PRESETS.map(preset => (
                  <button key={preset.id} className={styles.presetCard} onClick={() => addPreset(preset)}>
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                    <small>{preset.items.map(item => META[item.type] || item.type).join(' · ')}</small>
                  </button>
                ))}
              </div>
            ) : (<>
            <input
              className={styles.pickerSearch}
              value={pickerQuery}
              onChange={event => setPickerQuery(event.target.value)}
              placeholder="Search sections…"
              autoFocus
            />
            {(() => {
              const results = Object.entries(META)
                // Flash deals' daily countdown restarted every midnight (a fake deadline), so it is no
                // longer offered; a store that already has one keeps it.
                .filter(([key]) => key !== 'flash_deals' && (isHome ? !['announcement', 'header', 'main_product', 'main_collection_banner', 'main_collection_grid'].includes(key) : !ZONE_HIDDEN_TYPES.has(key)))
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
            </>)}
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

      <nav className={styles.mobileSwitch} aria-label="Editor view">
        <button type="button" className={mobileView === 'sections' ? styles.active : ''} aria-pressed={mobileView === 'sections'} onClick={() => setMobileView('sections')}><PanelLeft size={15} /> Sections</button>
        <button type="button" className={mobileView === 'preview' ? styles.active : ''} aria-pressed={mobileView === 'preview'} onClick={() => setMobileView('preview')}><Eye size={15} /> Preview</button>
      </nav>

      {message && (
        <div className={`${styles.notice} ${messageIsError ? styles.noticeError : ''}`} role={messageIsError ? 'alert' : 'status'}>
          <span>{message}</span>
          <button type="button" onClick={() => { setMessage(''); setMessageIsError(false) }} aria-label="Dismiss message">×</button>
        </div>
      )}

    </div>
  )
}
