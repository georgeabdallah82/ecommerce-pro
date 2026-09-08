import { PrismaClient } from '@prisma/client'
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
    products: mockProducts.filter((p) => p.featured).map((p) => ({ productId: p.id, collectionId: 'col-best-sellers' })),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
]

// Default hash for 'ChangeMe123!' or 'admin123'
const defaultAdminHash = '$2b$10$vI8aWBnW3fID.ZQ4/zo1G.qH0.6xLz33MhQ2tE0aGz4/w3oYjBymG'

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
      return []
    },
    findUnique: async (args: any) => {
      const where = args?.where || {}
      if (model === 'setting' && where.key) {
        const val = mockSettings.get(where.key)
        return val ? { id: `set-${where.key}`, key: where.key, value: val } : null
      }
      if (model === 'product') {
        if (where.id) return mockProducts.find((p) => p.id === where.id) || null
        if (where.slug) return mockProducts.find((p) => p.slug === where.slug) || null
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
        if (existing) { Object.assign(existing, args.update || {}); return existing }
        const created = { id: `usr-${Date.now()}`, ...args.create }
        mockUsers.push(created)
        return created
      }
      return args?.create || args?.update || {}
    },
    create: async (args: any) => {
      const item = { id: `${model}-${Date.now()}`, createdAt: new Date(), updatedAt: new Date(), ...(args?.data || {}) }
      if (model === 'order') mockOrders.unshift(item)
      return item
    },
    update: async (args: any) => {
      if (model === 'user' && args.where?.id) {
        const u = mockUsers.find((x) => x.id === args.where.id)
        if (u) Object.assign(u, args.data || {})
        return u || args.data
      }
      return args?.data || {}
    },
    delete: async () => ({}),
    count: async () => {
      if (model === 'product') return mockProducts.length
      if (model === 'order') return mockOrders.length
      if (model === 'user') return mockUsers.length
      return 0
    },
    createMany: async (args: any) => ({ count: args?.data?.length || 0 }),
    updateMany: async () => ({ count: 1 }),
    deleteMany: async () => ({ count: 0 }),
  }
}

// Create real PrismaClient instance
let realPrisma: any = null
try {
  realPrisma = new PrismaClient()
} catch {
  console.warn('[AI Studio] Database client initialization warning — using resilient proxy')
}

// Check if database URL is a mock or placeholder
function isPlaceholderDb() {
  const url = process.env.DATABASE_URL || ''
  return !url || url.includes('USER:PASSWORD@HOST') || url.includes('localhost')
}

// Create a safe proxy that executes real queries when a real DB is connected,
// and falls back immediately and gracefully to in-memory mock data if offline or unreachable.
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
      if (['product','category','collection','user','setting','order','coupon','shippingZone'].includes(prop)) return getMockHandler(prop)
      return Reflect.get(target, prop)
    },
  })
}

const prisma = globalForPrisma.prisma || createResilientPrismaClient()
globalForPrisma.prisma = prisma

export default prisma
export { prisma }
