import { PrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'
import { defaultTheme, defaultSections, defaultNavigation } from './theme-defaults'

const globalForPrisma = globalThis as unknown as { prisma?: any }

// Pre-seeded in-memory mock store for resilient operation when database is offline or unprovisioned
const mockCategories = [
  { id: 'cat-featured', name: 'Featured', slug: 'featured', description: 'Curated products', sortOrder: 0 },
  { id: 'cat-home', name: 'Home Essentials', slug: 'home-essentials', description: 'Practical everyday products', sortOrder: 1 },
]

const mockProducts = [
  {
    id: 'prod-1',
    name: 'Essential Starter Kit',
    slug: 'essential-starter-kit',
    basePrice: 3900,
    compareAtPrice: 4900,
    sku: 'SKU-001',
    status: 'ACTIVE',
    featured: true,
    shortDescription: 'Thoughtfully selected essentials with a clean, premium presentation.',
    description: 'Designed for modern lifestyles, the Essential Starter Kit brings together elevated craftsmanship and daily utility.',
    categoryId: 'cat-featured',
    category: mockCategories[0],
    images: [
      { id: 'img-1', url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80', alt: 'Essential Starter Kit', sortOrder: 0 },
      { id: 'img-1b', url: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80', alt: 'Essential Starter Kit Detail', sortOrder: 1 },
    ],
    collections: [],
    variants: [],
    inventory: [{ id: 'inv-1', quantity: 48, lowStockThreshold: 5, location: 'Main' }],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
  {
    id: 'prod-2',
    name: 'Everyday Home Set',
    slug: 'everyday-home-set',
    basePrice: 5900,
    compareAtPrice: 6900,
    sku: 'SKU-002',
    status: 'ACTIVE',
    featured: true,
    shortDescription: 'Practical and elegant home goods built for timeless aesthetics.',
    description: 'A curated suite of functional accents designed to enrich your space with organic textures and thoughtful details.',
    categoryId: 'cat-home',
    category: mockCategories[1],
    images: [
      { id: 'img-2', url: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80', alt: 'Everyday Home Set', sortOrder: 0 },
    ],
    collections: [],
    variants: [],
    inventory: [{ id: 'inv-2', quantity: 36, lowStockThreshold: 5, location: 'Main' }],
    createdAt: new Date('2025-01-02'),
    updatedAt: new Date('2025-01-02'),
  },
  {
    id: 'prod-3',
    name: 'Premium Care Bundle',
    slug: 'premium-care-bundle',
    basePrice: 7900,
    compareAtPrice: 9500,
    sku: 'SKU-003',
    status: 'ACTIVE',
    featured: false,
    shortDescription: 'An exclusive collection of personal care essentials for discerning users.',
    description: 'Formulated with sustainable ingredients and packaged in refillable, minimalist vessels.',
    categoryId: 'cat-featured',
    category: mockCategories[0],
    images: [
      { id: 'img-3', url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80', alt: 'Premium Care Bundle', sortOrder: 0 },
    ],
    collections: [],
    variants: [],
    inventory: [{ id: 'inv-3', quantity: 24, lowStockThreshold: 5, location: 'Main' }],
    createdAt: new Date('2025-01-03'),
    updatedAt: new Date('2025-01-03'),
  },
  {
    id: 'prod-4',
    name: 'Smart Organizer',
    slug: 'smart-organizer',
    basePrice: 2900,
    compareAtPrice: null,
    sku: 'SKU-004',
    status: 'ACTIVE',
    featured: false,
    shortDescription: 'Streamlined desktop and home organizer with minimalist finish.',
    description: 'Precision-machined compartments keep workspaces uncluttered and essentials always within reach.',
    categoryId: 'cat-home',
    category: mockCategories[1],
    images: [
      { id: 'img-4', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', alt: 'Smart Organizer', sortOrder: 0 },
    ],
    collections: [],
    variants: [],
    inventory: [{ id: 'inv-4', quantity: 50, lowStockThreshold: 10, location: 'Main' }],
    createdAt: new Date('2025-01-04'),
    updatedAt: new Date('2025-01-04'),
  },
  {
    id: 'prod-5',
    name: 'Daily Essentials Pack',
    slug: 'daily-essentials-pack',
    basePrice: 4500,
    compareAtPrice: 5500,
    sku: 'SKU-005',
    status: 'ACTIVE',
    featured: true,
    shortDescription: 'Everyday carry essentials packaged in a sustainable compact case.',
    description: 'Durable, weather-resistant materials built to endure daily transit while looking effortless.',
    categoryId: 'cat-featured',
    category: mockCategories[0],
    images: [
      { id: 'img-5', url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80', alt: 'Daily Essentials Pack', sortOrder: 0 },
    ],
    collections: [],
    variants: [],
    inventory: [{ id: 'inv-5', quantity: 30, lowStockThreshold: 5, location: 'Main' }],
    createdAt: new Date('2025-01-05'),
    updatedAt: new Date('2025-01-05'),
  },
  {
    id: 'prod-6',
    name: 'Signature Value Box',
    slug: 'signature-value-box',
    basePrice: 9900,
    compareAtPrice: 12000,
    sku: 'SKU-006',
    status: 'ACTIVE',
    featured: false,
    shortDescription: 'Our signature flagship package with all essentials included.',
    description: 'The ultimate gift set containing our entire range of award-winning staples.',
    categoryId: 'cat-featured',
    category: mockCategories[0],
    images: [
      { id: 'img-6', url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=80', alt: 'Signature Value Box', sortOrder: 0 },
    ],
    collections: [],
    variants: [],
    inventory: [{ id: 'inv-6', quantity: 15, lowStockThreshold: 3, location: 'Main' }],
    createdAt: new Date('2025-01-06'),
    updatedAt: new Date('2025-01-06'),
  },
]

const mockCollections = [
  {
    id: 'col-best-sellers',
    name: 'Best Sellers',
    slug: 'best-sellers',
    description: 'Our most popular essentials',
    sortOrder: 0,
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    products: mockProducts.filter((p) => p.featured).map((p) => ({ productId: p.id, collectionId: 'col-best-sellers', product: p })),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
]

// Hash for the README-documented default seed password 'ChangeMe123!'. The
// previous hash here didn't actually match either candidate password it
// claimed to, so the mock admin account was never loginable in local dev.
const defaultAdminHash = '$2b$10$/W2erNHQLpGmyCqMv3V6/O1YUf.kibZXLWMXM0jT4rCmES1z8xMpe'

const mockUsers = [
  {
    id: 'usr-admin-1',
    name: 'Store Admin',
    email: 'admin@example.com',
    role: 'SUPER_ADMIN',
    isActive: true,
    passwordHash: defaultAdminHash,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    lastLoginAt: new Date(),
  },
  {
    id: 'usr-customer-1',
    name: 'Demo Customer',
    email: 'customer@example.com',
    role: 'CUSTOMER',
    isActive: true,
    passwordHash: defaultAdminHash,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    lastLoginAt: null,
  },
]

const mockSettings = new Map<string, string>([
  ['theme.config', JSON.stringify(defaultTheme)],
  ['theme.sections', JSON.stringify(defaultSections)],
  ['navigation.main', JSON.stringify(defaultNavigation)],
  ['store.name', process.env.NEXT_PUBLIC_BRAND_NAME || 'Ecommerce Pro'],
  ['store.currency', process.env.NEXT_PUBLIC_CURRENCY || 'USD'],
  ['store.country', process.env.NEXT_PUBLIC_COUNTRY || 'US'],
  ['checkout.freeShippingThreshold', '50'],
  ['checkout.taxRatePercent', '0'],
  ['storefront_note', 'Free shipping on orders over $50.'],
])

const mockOrders: any[] = []
const mockCoupons = [
  {
    id: 'cp-welcome10',
    code: 'WELCOME10',
    type: 'PERCENTAGE',
    value: 10,
    maxUses: 100,
    usedCount: 0,
    isActive: true,
    firstOrderOnly: true,
    createdAt: new Date('2025-01-01'),
  },
]

const mockShippingZones = [
  {
    id: 'zone-standard',
    name: 'Standard Worldwide',
    countries: '*',
    rates: [
      { id: 'rate-1', name: 'Standard delivery', price: 500, freeAbove: 5000, estimatedDays: 3, isActive: true },
    ],
  },
]

const mockAdminLoginLockouts = new Map<string, { id: string; email: string; failedCount: number; lockedUntil: Date | null; updatedAt: Date }>()
const mockThemeVersions: Array<{ id: string; theme: string; sections: string; navigation: string; createdAt: Date; createdBy: string | null }> = []
// Locations/sales channels/webhooks/API credentials all start empty (no seed
// data) and are populated only through their admin CRUD routes -- unlike the
// generic fallback below, these arrays are actually mutated on create/update/
// delete so the admin operations hub's forms round-trip in local dev.
const mockStoreLocations: any[] = []
const mockSalesChannels: any[] = []
const mockWebhookEndpoints: any[] = []
const mockApiCredentials: any[] = []

function getMockHandler(model: string) {
  return {
    findMany: async (args?: any) => {
      if (model === 'product') {
        let list = [...mockProducts]
        if (args?.where?.status) list = list.filter((p) => p.status === args.where.status)
        if (args?.where?.featured !== undefined) list = list.filter((p) => p.featured === args.where.featured)
        if (args?.where?.slug) list = list.filter((p) => p.slug === args.where.slug)
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'category') return [...mockCategories]
      if (model === 'collection') {
        let list = [...mockCollections]
        if (args?.where?.isActive !== undefined) list = list.filter((c) => c.isActive === args.where.isActive)
        return list
      }
      if (model === 'order') return [...mockOrders]
      if (model === 'coupon') return [...mockCoupons]
      if (model === 'shippingZone') return [...mockShippingZones]
      if (model === 'user') return [...mockUsers]
      if (model === 'setting') return Array.from(mockSettings.entries()).map(([key, value]) => ({ key, value }))
      if (model === 'themeVersion') {
        let list = [...mockThemeVersions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'storeLocation') return [...mockStoreLocations].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
      if (model === 'salesChannel') return [...mockSalesChannels].map(c => ({ ...c, _count: { publications: 0 } }))
      if (model === 'webhookEndpoint') return [...mockWebhookEndpoints].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      if (model === 'apiCredential') return [...mockApiCredentials].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      return []
    },
    findUnique: async (args: any) => {
      const where = args?.where || {}
      if (model === 'setting' && where.key) {
        const val = mockSettings.get(where.key)
        return val ? { id: `set-${where.key}`, key: where.key, value: val } : null
      }
      if (model === 'product') {
        const found = where.id
          ? mockProducts.find((p) => p.id === where.id)
          : where.slug
            ? mockProducts.find((p) => p.slug === where.slug)
            : undefined
        // mockProducts entries don't carry every relation Prisma's `include` can ask
        // for (e.g. reviews, tags) -- default those to empty arrays so callers that
        // assume Prisma's always-an-array shape (never undefined) don't crash.
        return found ? { reviews: [], tags: [], ...found } : null
      }
      if (model === 'user') {
        if (where.email) return mockUsers.find((u) => u.email.toLowerCase() === String(where.email).toLowerCase()) || null
        if (where.id) return mockUsers.find((u) => u.id === where.id) || null
      }
      if (model === 'category') {
        if (where.slug) return mockCategories.find((c) => c.slug === where.slug) || null
        if (where.id) return mockCategories.find((c) => c.id === where.id) || null
      }
      if (model === 'collection') {
        if (where.slug) return mockCollections.find((c) => c.slug === where.slug) || null
        if (where.id) return mockCollections.find((c) => c.id === where.id) || null
      }
      if (model === 'coupon' && where.code) return mockCoupons.find((c) => c.code.toUpperCase() === String(where.code).toUpperCase()) || null
      if (model === 'adminLoginLockout' && where.email) return mockAdminLoginLockouts.get(where.email) || null
      if (model === 'themeVersion' && where.id) return mockThemeVersions.find((v) => v.id === where.id) || null
      if (model === 'storeLocation') return (where.id ? mockStoreLocations.find((x) => x.id === where.id) : where.handle ? mockStoreLocations.find((x) => x.handle === where.handle) : null) || null
      if (model === 'salesChannel') return (where.id ? mockSalesChannels.find((x) => x.id === where.id) : where.handle ? mockSalesChannels.find((x) => x.handle === where.handle) : null) || null
      if (model === 'webhookEndpoint' && where.id) return mockWebhookEndpoints.find((x) => x.id === where.id) || null
      if (model === 'apiCredential' && where.id) return mockApiCredentials.find((x) => x.id === where.id) || null
      return null
    },
    findFirst: async (args?: any) => {
      const where = args?.where || {}
      if (model === 'setting' && where.key) {
        const val = mockSettings.get(where.key)
        return val ? { id: `set-${where.key}`, key: where.key, value: val } : null
      }
      if (model === 'user') {
        if (where.email) return mockUsers.find((u) => u.email.toLowerCase() === String(where.email).toLowerCase()) || null
        return mockUsers[0] || null
      }
      if (model === 'shippingZone') return mockShippingZones[0] || null
      if (model === 'product') return mockProducts[0] || null
      return null
    },
    upsert: async (args: any) => {
      if (model === 'setting' && args.where?.key) {
        const val = args.update?.value ?? args.create?.value ?? ''
        mockSettings.set(args.where.key, val)
        return { key: args.where.key, value: val }
      }
      if (model === 'user' && args.where?.email) {
        const existing = mockUsers.find((u) => u.email === args.where.email)
        if (existing) {
          Object.assign(existing, args.update || {})
          return existing
        }
        const created = { id: `usr-${Date.now()}`, ...args.create }
        mockUsers.push(created)
        return created
      }
      if (model === 'adminLoginLockout' && args.where?.email) {
        const existing = mockAdminLoginLockouts.get(args.where.email)
        const record = existing
          ? { ...existing, ...(args.update || {}), updatedAt: new Date() }
          : { id: `lockout-${Date.now()}`, email: args.where.email, failedCount: 0, lockedUntil: null, ...(args.create || {}), updatedAt: new Date() }
        mockAdminLoginLockouts.set(args.where.email, record)
        return record
      }
      return args?.create || args?.update || {}
    },
    create: async (args: any) => {
      const item = { id: `${model}-${Date.now()}`, createdAt: new Date(), updatedAt: new Date(), ...(args?.data || {}) }
      if (model === 'order') mockOrders.unshift(item)
      if (model === 'themeVersion') mockThemeVersions.unshift(item)
      if (model === 'storeLocation') { if (item.isDefault) for (const x of mockStoreLocations) x.isDefault = false; mockStoreLocations.push(item) }
      if (model === 'salesChannel') mockSalesChannels.push(item)
      if (model === 'webhookEndpoint') mockWebhookEndpoints.push(item)
      if (model === 'apiCredential') { if (item.status === undefined) item.status = 'ACTIVE'; mockApiCredentials.push(item) }
      return item
    },
    update: async (args: any) => {
      if (model === 'user' && args.where?.id) {
        const u = mockUsers.find((x) => x.id === args.where.id)
        if (u) Object.assign(u, args.data || {})
        return u || args.data
      }
      const byId: Record<string, any[]> = { storeLocation: mockStoreLocations, salesChannel: mockSalesChannels, webhookEndpoint: mockWebhookEndpoints, apiCredential: mockApiCredentials }
      if (byId[model] && args.where?.id) {
        const row = byId[model].find((x) => x.id === args.where.id)
        if (!row) throw new Error('Record to update not found')
        if (model === 'storeLocation' && args.data?.isDefault === true) for (const x of mockStoreLocations) x.isDefault = false
        Object.assign(row, args.data || {}, { updatedAt: new Date() })
        return row
      }
      return args?.data || {}
    },
    delete: async (args?: any) => {
      const byId: Record<string, any[]> = { storeLocation: mockStoreLocations, salesChannel: mockSalesChannels, webhookEndpoint: mockWebhookEndpoints, apiCredential: mockApiCredentials }
      const list = byId[model]
      if (list && args?.where?.id) { const i = list.findIndex((x) => x.id === args.where.id); if (i >= 0) return list.splice(i, 1)[0] }
      return {}
    },
    count: async () => {
      if (model === 'product') return mockProducts.length
      if (model === 'order') return mockOrders.length
      if (model === 'user') return mockUsers.length
      return 0
    },
    createMany: async (args: any) => ({ count: args?.data?.length || 0 }),
    updateMany: async (args?: any) => {
      if (model === 'storeLocation') {
        const excludeId = args?.where?.id?.not
        let count = 0
        for (const x of mockStoreLocations) { if (excludeId && x.id === excludeId) continue; Object.assign(x, args?.data || {}); count++ }
        return { count }
      }
      return { count: 1 }
    },
    // Generic aggregation fallbacks -- an empty group list / all-zero
    // aggregate is always a safe shape for callers that only ever consume
    // real data when a database is actually connected (dashboards, reports).
    groupBy: async () => [],
    aggregate: async () => ({ _sum: {}, _count: {}, _avg: {}, _min: {}, _max: {} }),
    deleteMany: async (args?: any) => {
      if (model === 'themeVersion' && args?.where?.id?.in) {
        const ids = new Set<string>(args.where.id.in)
        const before = mockThemeVersions.length
        for (let i = mockThemeVersions.length - 1; i >= 0; i--) if (ids.has(mockThemeVersions[i].id)) mockThemeVersions.splice(i, 1)
        return { count: before - mockThemeVersions.length }
      }
      return { count: 0 }
    },
  }
}

// Create the real PrismaClient instance. This runs on Cloudflare Workers, which cannot open
// raw TCP connections to MongoDB, so it must go through Prisma Accelerate (an HTTPS proxy) —
// DATABASE_URL is expected to be an Accelerate connection string (prisma://...), not a direct
// mongodb:// URL. The edge client works identically in Node.js (local dev), so this is the one
// client used everywhere.
function createExtendedClient() {
  return new PrismaClient().$extends(withAccelerate())
}
// Extended clients lose their generated type unless captured explicitly like this — without it,
// db falls back to `any` and every query loses select/include payload inference project-wide.
type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>

const isProduction = process.env.NODE_ENV === 'production'
let realPrisma: ExtendedPrismaClient | null = null
try {
  // `new PrismaClient()` returns synchronously even when DATABASE_URL is
  // missing or invalid — it only discovers that when a query actually runs,
  // as an unhandled promise rejection this try/catch can never observe (it
  // isn't awaited here). Checking the env var directly, before constructing
  // the client at all, is what actually lets a missing DATABASE_URL reach
  // the production-throws / non-production-falls-back-to-mock branch below
  // instead of silently leaving realPrisma set to a client that will fail
  // every real query later.
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  realPrisma = createExtendedClient()
} catch (error) {
  if (isProduction) {
    throw new Error('Failed to initialize the database client. DATABASE_URL must be configured as a valid Prisma Accelerate connection string in production.', { cause: error })
  }
  console.warn('[AI Studio] Database client initialization warning — using resilient proxy for local development')
}

// Create a safe proxy that executes real queries when a real DB is connected,
// and falls back immediately and gracefully to in-memory mock data if offline or unreachable.
// This fallback (including the seeded mock admin account) must never be reachable in
// production — a misconfigured DATABASE_URL there fails the deployment loudly instead of
// silently serving fake data behind a known default login.
function createResilientPrismaClient(): any {
  return new Proxy(realPrisma || {}, {
    get(target, prop: string | symbol) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)

      if (prop === '$connect' || prop === '$disconnect') return async () => {}
      if (prop === '$transaction') {
        return async (arg: any) => {
          if (typeof arg === 'function') return arg(createResilientPrismaClient())
          if (Array.isArray(arg)) return Promise.all(arg)
          return []
        }
      }

      if (prop in target) return Reflect.get(target, prop)
      // Any model prop not already resolved above (no real client, or the
      // real client doesn't have it) gets a generic in-memory mock in
      // non-production. This used to be an explicit allowlist that had to
      // be updated by hand every time a route queried a new Prisma model
      // without DATABASE_URL configured, and every miss was the same
      // "Cannot read properties of undefined" crash -- adminLoginLockout,
      // auditLog, liveVisitorSession and inventoryItem all hit it before
      // being added one at a time. getMockHandler's generic fallbacks
      // (empty list / null / create-or-update echo) are always safe for a
      // model with no special-cased mock data, so there's nothing left for
      // an allowlist to gate.
      if (!isProduction) return getMockHandler(prop)
      return Reflect.get(target, prop)
    },
  })
}

const db: ExtendedPrismaClient = (globalForPrisma.prisma ?? createResilientPrismaClient()) as ExtendedPrismaClient
globalForPrisma.prisma = db

export const prisma = db
export { db }
export default db
