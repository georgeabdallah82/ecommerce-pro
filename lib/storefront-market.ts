// The "market" storefront: red header with a delivery bar, a full-photo hero slider, product
// rows and category blocks. These are its defaults, and the one-time switch that moves a store
// still on the older storefront onto it (see lib/theme.ts). Everything here stays editable in
// the theme studio; the switch only runs once (theme.storefrontVersion records it).

export const STOREFRONT_VERSION = 2

export const MARKET_COLORS = {
  background: '#f6f6f4', surface: '#ffffff', text: '#121212', muted: '#6b7280',
  primary: '#d7261e', secondary: '#fdecea', buttonText: '#ffffff', border: '#ececec',
  announcementBg: '#121212', announcementText: '#ffffff', accent: '#facc15',
  sale: '#d7261e', success: '#15803d', warning: '#b7791f',
}

// Free stock photos (Unsplash licence) shipped with the store so the homepage looks finished
// before the merchant uploads their own; every one can be replaced in the theme studio.
export const STOCK = {
  heroKitchen: '/stock/hero-kitchen.jpg',
  heroRolls: '/stock/hero-rolls.jpg',
  heroBottles: '/stock/hero-bottles.jpg',
  offerHome: '/stock/offer-home.jpg',
  offerCare: '/stock/offer-care.jpg',
  spotCleaning: '/stock/spot-cleaning.jpg',
}

const block = (type: string, settings: Record<string, any>) => ({ id: `${type}-${Math.random().toString(36).slice(2, 9)}`, type, settings })

export function heroSlideDefaults() {
  return [
    block('hero_slide', { tag: 'Home essentials', heading: 'Everything for your home,', highlight: 'delivered', text: 'Cash on delivery anywhere in Lebanon.', buttonLabel: 'Shop now', buttonUrl: '/shop', secondaryLabel: 'Browse collections', secondaryUrl: '/collections', imageUrl: STOCK.heroKitchen, mobileImageUrl: '', badge: '' }),
    block('hero_slide', { tag: 'Stock up', heading: 'Tissues & paper,', highlight: 'in bulk', text: 'Big packs for the whole family, delivered to your door.', buttonLabel: 'Shop tissues', buttonUrl: '/shop', secondaryLabel: '', secondaryUrl: '', imageUrl: STOCK.heroRolls, mobileImageUrl: '', badge: '' }),
    block('hero_slide', { tag: 'Personal care', heading: 'Fresh picks for your', highlight: 'routine', text: 'Shampoo, body care and more.', buttonLabel: 'Discover', buttonUrl: '/shop', secondaryLabel: '', secondaryUrl: '', imageUrl: STOCK.heroBottles, mobileImageUrl: '', badge: '' }),
  ]
}

export function offerDefaults() {
  return [
    block('offer', { kicker: 'Home', heading: 'Everyday home essentials', linkLabel: 'Shop now', url: '/shop', imageUrl: STOCK.offerHome }),
    block('offer', { kicker: 'Personal care', heading: 'Care for the whole family', linkLabel: 'Shop now', url: '/shop', imageUrl: STOCK.offerCare }),
  ]
}

export function priceBandDefaults() {
  return [
    block('price_band', { label: 'Under $8', min: 0, max: 8 }),
    block('price_band', { label: '$8 – $12', min: 8, max: 12 }),
    block('price_band', { label: '$12 and up', min: 12, max: 0 }),
  ]
}

export function marketSectionDefaults(type: string): Record<string, any> | null {
  if (type === 'hero_slider') return { settings: { layout: 'full', autoplay: true, speed: 5, height: 560, mobileHeight: 460 }, blocks: heroSlideDefaults() }
  if (type === 'offer_banners') return { settings: {}, blocks: offerDefaults() }
  if (type === 'product_tabs') return { settings: { heading: "Today's deals", showDeals: true, showBest: true, showNew: true, limit: 10, minProducts: 4 } }
  if (type === 'product_rail') return { settings: { heading: 'Best sellers', subheading: 'What customers are ordering', source: 'best', limit: 12, showRank: true, minProducts: 4 } }
  if (type === 'category_spotlight') return { settings: { heading: '', collection: '', kicker: 'Featured', bannerHeading: 'A cleaner home in one order', buttonLabel: 'Shop now', imageUrl: STOCK.spotCleaning, bannerPosition: 'left', limit: 4, minProducts: 2 } }
  if (type === 'shop_by_price') return { settings: { heading: 'Shop by price', limit: 10, minProducts: 2 }, blocks: priceBandDefaults() }
  if (type === 'recently_viewed') return { settings: { heading: 'Recently viewed', limit: 6 } }
  if (type === 'bundles') return { settings: { heading: 'Bundle & save', subheading: 'Ready-made sets, cheaper than buying each item', limit: 6 } }
  return null
}

const section = (type: string, extra: Record<string, any> = {}) => {
  const d = marketSectionDefaults(type) || { settings: {} }
  return { id: `${type}-market`, type, enabled: true, settings: { ...d.settings, ...extra }, blocks: d.blocks || [] }
}

// The homepage a new (or freshly switched) store starts with: fewer sections at launch, and
// every product row hides itself until the store has enough products to fill it.
export function marketHomeSections() {
  return [
    section('hero_slider'),
    section('offer_banners'),
    { id: 'category_strip-market', type: 'category_strip', enabled: true, settings: { heading: 'Shop by category', limit: 12 }, blocks: [] },
    section('product_tabs'),
    section('product_rail'),
    section('category_spotlight'),
    { id: 'trust_strip-market', type: 'trust_strip', enabled: true, settings: {}, blocks: [
      block('trust_item', { heading: 'Cash on delivery', text: 'Pay when your order arrives' }),
      block('trust_item', { heading: 'Delivery all over Lebanon', text: 'Fast and tracked' }),
      block('trust_item', { heading: 'Easy returns', text: 'See our refund policy' }),
      block('trust_item', { heading: 'WhatsApp support', text: 'Questions? Message us' }),
    ] },
  ]
}

const SITE_WIDE = new Set(['header', 'announcement', 'footer'])

// Moves a theme (and its homepage sections) onto the market storefront, once. Brand name,
// logos, social links, announcement messages, navigation and every non-home template are
// kept; colours, fonts, buttons and the homepage content are replaced. Returns the input
// untouched when the store has already been switched.
export function switchToMarket<T extends Record<string, any>>(theme: T, homeSections: any[]): { theme: T; sections: any[]; switched: boolean } {
  if (Number(theme?.storefrontVersion || 0) >= STOREFRONT_VERSION) return { theme, sections: homeSections, switched: false }
  const next: any = { ...theme }
  next.colors = { ...(theme.colors || {}), ...MARKET_COLORS }
  next.typography = { ...(theme.typography || {}), heading: 'dmSans', body: 'dmSans', headingWeight: '800', bodyWeight: '400' }
  next.buttons = { ...(theme.buttons || {}), radius: 10, uppercase: false, height: 46 }
  next.cards = { ...(theme.cards || {}), radius: 14 }
  next.header = { ...(theme.header || {}), style: 'market', sticky: true, background: '', transparent: false, transparentHome: false }
  next.design = 'market'
  // The old admin "Content" announcement/trust rows would otherwise print above the new homepage.
  next.legacyHomeBlocksMigrated = true
  next.storefrontVersion = STOREFRONT_VERSION
  const kept = (Array.isArray(homeSections) ? homeSections : []).filter(s => s && SITE_WIDE.has(s.type))
  const header = kept.filter(s => s.type === 'header')
  const others = kept.filter(s => s.type !== 'header' && s.type !== 'footer')
  const footer = kept.filter(s => s.type === 'footer')
  const sections = [...header, ...others, ...marketHomeSections(), ...footer]
  return { theme: next, sections, switched: true }
}

export const isMarket = (theme: any) => theme?.design === 'market'

export type DeliveryArea = { name: string; eta: string }

// The delivery bar's areas (Theme settings › Delivery bar): one per line, "Area | delivery time"
// (the time is optional).
export function parseDeliveryAreas(raw: unknown): DeliveryArea[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map(line => {
      const [name, ...rest] = line.split('|')
      return { name: (name || '').trim().slice(0, 60), eta: rest.join('|').trim().slice(0, 80) }
    })
    .filter(a => a.name)
    .slice(0, 40)
}
