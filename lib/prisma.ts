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
    inventory: [{ id: 'inv-1', quantity: 48, lowStockThreshold: 5, locationId: null, location: null }],
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
    inventory: [{ id: 'inv-2', quantity: 36, lowStockThreshold: 5, locationId: null, location: null }],
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
    inventory: [{ id: 'inv-3', quantity: 24, lowStockThreshold: 5, locationId: null, location: null }],
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
    inventory: [{ id: 'inv-4', quantity: 50, lowStockThreshold: 10, locationId: null, location: null }],
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
    inventory: [{ id: 'inv-5', quantity: 30, lowStockThreshold: 5, locationId: null, location: null }],
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
    inventory: [{ id: 'inv-6', quantity: 15, lowStockThreshold: 3, locationId: null, location: null }],
    createdAt: new Date('2025-01-06'),
    updatedAt: new Date('2025-01-06'),
  },
]

const mockCollections: any[] = [
  {
    id: 'col-best-sellers',
    name: 'Best Sellers',
    slug: 'best-sellers',
    description: 'Our most popular essentials',
    sortOrder: 0,
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
]
// CollectionProduct join rows live in their own top-level array with collectionId/productId
// foreign keys, joined back onto whichever side asked for it at read time (see
// deriveCollectionProducts/deriveProductCollections below) -- the same pattern
// deriveMockProductVariants/derivePurchaseOrderItems already use -- rather than the
// previous static, once-computed `products` array embedded on the seed collection, which
// never changed when a product's `featured` flag changed or a collectionProduct row was
// written (it never was, since collectionProduct itself had zero mock backing before this).
const mockCollectionProducts: any[] = mockProducts.filter((p: any) => p.featured).map((p: any, i: number) => ({ id: `colprod-seed-${i}`, collectionId: 'col-best-sellers', productId: p.id, sortOrder: i }))
function deriveCollectionProducts(collectionId: string) {
  return mockCollectionProducts.filter((cp: any) => cp.collectionId === collectionId).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
}
function deriveProductCollections(productId: string) {
  return mockCollectionProducts.filter((cp: any) => cp.productId === productId)
}
function withMockProductJoin(product: any) {
  return {
    ...product,
    images: [...(product.images || [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    category: product.categoryId ? mockCategories.find((c: any) => c.id === product.categoryId) || null : product.category ?? null,
    variants: deriveMockProductVariants(product.id),
    inventory: deriveMockProductInventory(product.id, false),
    collections: joinProductCollections(product.id, { include: { collection: true } }),
  }
}
// Shared by collection.findMany/findUnique's `include.products` -- joins each CollectionProduct
// row's `.product` (the full product, same shape product.findUnique already returns) only when
// actually requested, and honors the `where.productId.notIn` filter the storefront collection
// page uses to hide unpublished products from a collection listing.
function joinCollectionProducts(collectionId: string, productsArg: any) {
  let rows = deriveCollectionProducts(collectionId)
  const notIn: string[] | undefined = productsArg?.where?.productId?.notIn
  if (notIn) { const excluded = new Set(notIn); rows = rows.filter((r: any) => !excluded.has(r.productId)) }
  const wantsProduct = productsArg && typeof productsArg === 'object' && (productsArg.include?.product || productsArg.select?.product)
  if (!wantsProduct) return rows.map((r: any) => ({ ...r }))
  return rows.map((r: any) => {
    const product = mockProducts.find((p: any) => p.id === r.productId)
    return { ...r, product: product ? withMockProductJoin(product) : null }
  })
}
// Shared by product.findMany/findUnique's `include.collections` -- the reverse join, used by
// the theme editor's collection-filtered product_grid/product_carousel sections.
function joinProductCollections(productId: string, collectionsArg: any) {
  const rows = deriveProductCollections(productId)
  const wantsCollection = collectionsArg && typeof collectionsArg === 'object' && (collectionsArg.include?.collection || collectionsArg.select?.collection)
  if (!wantsCollection) return rows.map((r: any) => ({ ...r }))
  return rows.map((r: any) => ({ ...r, collection: mockCollections.find((c: any) => c.id === r.collectionId) || null }))
}

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
// PaymentTransaction has no standalone backing array -- every real row lives nested on its
// parent order's `.paymentTransactions` (the same array `order.findUnique({include:
// {paymentTransactions:true}})` already reads), matching how the order-nested `create`
// shorthand expands them at order-creation time. A standalone `tx.paymentTransaction.create/
// findFirst/findUnique/update()` -- used throughout checkout, refunds, returns, order-edits,
// cancellation and the areeba gateway integration -- searches/mutates that same array rather
// than a second, easily-desynced source of truth.
function findMockPaymentTransaction(where: any) {
  for (const order of mockOrders) {
    const list: any[] = order.paymentTransactions || []
    for (const t of list) {
      if (where.id !== undefined && t.id !== where.id) continue
      if (where.orderId !== undefined && t.orderId !== where.orderId) continue
      if (where.provider !== undefined && t.provider !== where.provider) continue
      if (where.externalId !== undefined && t.externalId !== where.externalId) continue
      if (where.status?.in && !where.status.in.includes(t.status)) continue
      return { order, transaction: t }
    }
  }
  return null
}
function findMockPaymentTransactions(where: any) {
  const results: { order: any; transaction: any }[] = []
  for (const order of mockOrders) {
    const list: any[] = order.paymentTransactions || []
    for (const t of list) {
      if (where.id !== undefined && t.id !== where.id) continue
      if (where.orderId !== undefined && t.orderId !== where.orderId) continue
      if (where.provider !== undefined && t.provider !== where.provider) continue
      if (where.externalId !== undefined && t.externalId !== where.externalId) continue
      if (where.status?.in && !where.status.in.includes(t.status)) continue
      results.push({ order, transaction: t })
    }
  }
  return results
}
const mockCoupons = [
  {
    id: 'cp-welcome10',
    code: 'WELCOME10',
    isAutomatic: false,
    type: 'PERCENTAGE',
    value: 10,
    maxUses: 100,
    usedCount: 0,
    isActive: true,
    firstOrderOnly: true,
    createdAt: new Date('2025-01-01'),
  },
]

const mockShippingZones: any[] = [
  {
    id: 'zone-standard',
    name: 'Standard Worldwide',
    countries: '*',
    regions: null,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    rates: [
      { id: 'rate-1', zoneId: 'zone-standard', name: 'Standard delivery', price: 500, freeAbove: 5000, estimatedDays: 3, isActive: true },
    ],
  },
]

const mockAdminLoginLockouts = new Map<string, { id: string; email: string; failedCount: number; lockedUntil: Date | null; updatedAt: Date }>()
const mockLiveVisitorSessions = new Map<string, any>()
const mockThemeVersions: Array<{ id: string; theme: string; sections: string; navigation: string; createdAt: Date; createdBy: string | null }> = []
// Locations/sales channels/webhooks/API credentials all start empty (no seed
// data) and are populated only through their admin CRUD routes -- unlike the
// generic fallback below, these arrays are actually mutated on create/update/
// delete so the admin operations hub's forms round-trip in local dev.
const mockStoreLocations: any[] = []
const mockSalesChannels: any[] = []
const mockWebhookEndpoints: any[] = []
const mockApiCredentials: any[] = []
const mockTaxRates: any[] = []
const mockFulfillments: any[] = []
const mockFulfillmentLines: any[] = []
const mockCustomerTags: any[] = []
const mockCustomerTagMembers: any[] = []
const mockCustomerSegments: any[] = []
const mockCustomerSegmentMembers: any[] = []
const mockWalletTransactions: any[] = []
const mockAbandonedCheckouts: any[] = []
const mockCoinTransactions: any[] = []
const mockGiftCards: any[] = []
const mockInventoryItems: any[] = []
// product.create/update/delete now derive `inventory`/`variants` dynamically from
// mockInventoryItems/mockProductVariants (source of truth, same as mockReviews already
// was for `reviews`) instead of a static array embedded on the product row -- seed this
// from the seed products' own embedded `inventory` so their stock numbers don't regress
// to empty the moment that derivation replaces the old always-stale embedded field.
for (const seedProduct of mockProducts) {
  for (const inv of seedProduct.inventory || []) mockInventoryItems.push({ ...inv, productId: seedProduct.id, variantId: (inv as any).variantId ?? null, reserved: (inv as any).reserved ?? 0 })
}
const mockProductVariants: any[] = []
const mockWishlistItems: any[] = []
const mockReviews: any[] = []
const mockBlogs: any[] = []
const mockBlogPosts: any[] = []
const mockPages: any[] = []
const mockRedirects: any[] = []
const mockOrderEdits: any[] = []
const mockDeliveryTracking: any[] = []
const mockProductPublications: any[] = []
const mockMetafieldDefinitions: any[] = []
const mockMetafieldValues: any[] = []
const mockMediaAssets: any[] = []
const mockInventoryTransfers: any[] = []
const mockPasswordResetTokens: any[] = []
// order.items/.events already generate ids with this prefix (see order.create's/order.update's
// own nested-write expansion below) -- orderItem/orderEvent, as standalone top-level model
// accessors used by the order-edit commit flow (and, for orderItem, the sold-count/verified-
// purchase features), operate on those SAME embedded arrays rather than a separate array, so
// reads through either path (db.order.findUnique's .items/.events or db.orderItem/orderEvent
// directly) always agree.
function genOrderChildId() { return `orderitem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
const mockAuditLogs: any[] = []
const mockInventoryMovements: any[] = []
const mockAddresses: any[] = []
const mockReturnRequests: any[] = []
const mockNotifications: any[] = []
const mockDraftOrders: any[] = []
// PurchaseOrderItem rows live in their own top-level array with a `purchaseOrderId` foreign
// key, joined back onto the parent at read time (see derivePurchaseOrderItems below) -- the
// same pattern deriveMockProductVariants/deriveMockProductInventory already use, rather than
// embedding items on the parent -- because purchaseOrderItem.update is called with only the
// item's own id (never a purchaseOrderId), and purchaseOrderItem.findMany is called directly
// with a `where.purchaseOrderId` filter, both of which a real top-level array serves naturally.
const mockPurchaseOrders: any[] = []
const mockPurchaseOrderItems: any[] = []
function derivePurchaseOrderItems(purchaseOrderId: string) {
  return mockPurchaseOrderItems.filter((x: any) => x.purchaseOrderId === purchaseOrderId)
}
// Mirrors the two rows prisma/seed.ts actually seeds -- unlike the operational arrays above,
// this is real storefront content (the announcement bar / trust strip the homepage renders),
// so it starts populated instead of empty, matching mockSettings' theme.config/theme.sections.
const mockHomepageBlocks: any[] = [
  { id: 'block-announcement-1', type: 'announcement', title: 'Free delivery on qualifying orders.', subtitle: null, contentJson: JSON.stringify({ text: 'Free delivery on qualifying orders.' }), isActive: true, sortOrder: 0, createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01') },
  { id: 'block-trust-1', type: 'trust', title: 'Built for a better everyday', subtitle: 'Fast delivery, simple checkout, helpful support.', contentJson: JSON.stringify({}), isActive: true, sortOrder: 1, createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01') },
]

// Matches the storefront's product text-search field filters -- {contains, mode?} --
// against a single mock product field. Real Prisma/Mongo does this server-side;
// the mock has to reimplement it by hand since it never reaches a real database.
function mockFieldContains(value: unknown, condition: any): boolean {
  const contains = condition?.contains
  if (typeof contains !== 'string' || typeof value !== 'string') return false
  return condition?.mode === 'insensitive'
    ? value.toLowerCase().includes(contains.toLowerCase())
    : value.includes(contains)
}

// Shared by product findMany/findUnique -- inventoryItem.create/update already have real
// mock backing (mockInventoryItems), but nothing joined them back onto a product's own
// `.inventory`/`.variants` fields, which stayed whatever was embedded at seed time and
// never changed. Deriving them fresh on every read is what actually makes a newly created
// or edited product's stock/variants show up again, mirroring how `reviews` already works.
function withMockLocation(inv: any) {
  return { ...inv, location: inv.locationId ? mockStoreLocations.find((l: any) => l.id === inv.locationId) || null : null }
}
// Shared by inventoryItem's findUnique/findUniqueOrThrow/findMany -- the admin Inventory
// page and the manual-adjustment route's post-write re-read both request product/variant/
// location/movements the same way, so a single item's relations are joined once here rather
// than duplicating the logic (and risking it drifting) across each dispatch method.
function joinMockInventoryItem(item: any, includeOrSelect: any) {
  const arg = includeOrSelect || {}
  const result: any = { ...item }
  if (arg.product) result.product = mockProducts.find((p: any) => p.id === item.productId) || null
  if (arg.variant) result.variant = item.variantId ? mockProductVariants.find((v: any) => v.id === item.variantId) || null : null
  if (arg.location) result.location = item.locationId ? mockStoreLocations.find((l: any) => l.id === item.locationId) || null : null
  if (arg.movements) {
    let moves = mockInventoryMovements.filter((m: any) => m.inventoryId === item.id)
    const movementsArg = arg.movements
    if (movementsArg?.orderBy?.createdAt === 'desc') moves = moves.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
    else if (movementsArg?.orderBy?.createdAt === 'asc') moves = moves.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
    if (movementsArg?.take) moves = moves.slice(0, movementsArg.take)
    result.movements = moves
  }
  return result
}
function deriveMockProductVariants(productId: string) {
  return mockProductVariants
    .filter((v: any) => v.productId === productId)
    .map((v: any) => ({ ...v, inventory: mockInventoryItems.filter((i: any) => i.variantId === v.id).map(withMockLocation) }))
}
function deriveMockProductInventory(productId: string, sharedOnly: boolean) {
  let rows = mockInventoryItems.filter((i: any) => i.productId === productId)
  if (sharedOnly) rows = rows.filter((i: any) => i.variantId == null)
  return rows.map(withMockLocation)
}

// Shared by auditLog findMany/count so the activity log's search box and its total count
// (used for pagination) always agree on what matches. `actor: { is: { email/name: ... } } }`
// is a nested-relation filter -- there's no separate mockAuditLogs.actor field to filter on
// directly, so it has to resolve the actor from mockUsers first, same idea as the inventoryItem
// findMany branch already does for its own `include.product`/`include.variant`.
function filterMockAuditLogs(where: any) {
  let list = [...mockAuditLogs]
  if (where?.entity) list = list.filter((x: any) => x.entity === where.entity)
  if (Array.isArray(where?.OR)) {
    list = list.filter((x: any) => where.OR.some((cond: any) => {
      if (cond.actor?.is) {
        const actor = mockUsers.find((u: any) => u.id === x.actorId)
        return Object.entries(cond.actor.is).some(([field, sub]) => mockFieldContains((actor as any)?.[field], sub))
      }
      return Object.entries(cond).some(([field, sub]) => mockFieldContains((x as any)[field], sub))
    }))
  }
  return list
}

function getMockHandler(model: string) {
  const handler = {
    findMany: async (args?: any) => {
      if (model === 'product') {
        let list = [...mockProducts]
        if (args?.where?.status) list = list.filter((p) => p.status === args.where.status)
        if (args?.where?.featured !== undefined) list = list.filter((p) => p.featured === args.where.featured)
        if (args?.where?.slug) list = list.filter((p) => p.slug === args.where.slug)
        if (args?.where?.id?.in) { const ids = new Set(args.where.id.in); list = list.filter((p) => ids.has(p.id)) }
        // The storefront's unpublished-product exclusion (getUnpublishedProductIds) and checkout's
        // availability re-check both key off this -- without it, a product hidden from every sales
        // channel stayed fully purchasable and visible on the homepage/shop/PDP/sitemap/related
        // products.
        if (args?.where?.id?.notIn) { const ids = new Set(args.where.id.notIn); list = list.filter((p) => !ids.has(p.id)) }
        if (args?.where?.id?.not !== undefined) list = list.filter((p) => p.id !== args.where.id.not)
        if (args?.where?.giftCard !== undefined) list = list.filter((p) => Boolean((p as any).giftCard) === args.where.giftCard)
        if (args?.where?.category?.slug) list = list.filter((p) => p.category?.slug === args.where.category.slug)
        // The admin products list's Category dropdown and the CSV export's categoryId param
        // both key off this plain scalar field, not the nested category.slug shape above --
        // without it, both silently returned the whole catalog regardless of the selected
        // category.
        if (args?.where?.categoryId !== undefined) list = list.filter((p: any) => p.categoryId === args.where.categoryId)
        if (args?.where?.publishedAt === null) list = list.filter((p: any) => p.publishedAt == null)
        if (args?.where?.basePrice?.gte !== undefined) list = list.filter((p) => p.basePrice >= args.where.basePrice.gte)
        if (args?.where?.basePrice?.lte !== undefined) list = list.filter((p) => p.basePrice <= args.where.basePrice.lte)
        if (Array.isArray(args?.where?.OR)) {
          const conditions: any[] = args.where.OR
          list = list.filter((p) => conditions.some((cond) => Object.entries(cond).some(([field, sub]) => mockFieldContains((p as any)[field], sub))))
        }
        // The admin products list's sort dropdown (name/price/created/updated, asc or desc) --
        // without this, every sort option silently no-opped and rows stayed in seed order.
        const orderBy = args?.orderBy
        if (orderBy && typeof orderBy === 'object') {
          const [field, dir] = Object.entries(orderBy)[0] as [string, string]
          list = list.sort((a: any, b: any) => {
            const av = a[field]; const bv = b[field]
            const cmp = av instanceof Date && bv instanceof Date ? av.getTime() - bv.getTime() : av < bv ? -1 : av > bv ? 1 : 0
            return dir === 'desc' ? -cmp : cmp
          })
        }
        // The admin products list's pagination relies on this -- without it, every page past
        // page 1 returned the same first `take` products instead of the next slice.
        if (args?.skip) list = list.slice(args.skip)
        if (args?.take) list = list.slice(0, args.take)
        // The public /api/products and /api/v1/products routes request these via `select`
        // (Prisma's other, equally valid way to request a relation) rather than `include` --
        // without also checking select here, both routes silently got back whatever stale
        // variants/collections were embedded on the product at creation time instead of a real
        // join, so the theme editor's collection-filtered sections and the partner product feed
        // both saw empty collections/variants for every product.
        const wantsVariants = args?.include?.variants || args?.select?.variants
        const wantsInventory = args?.include?.inventory || args?.select?.inventory
        if (wantsVariants || wantsInventory) {
          list = list.map((p: any) => ({
            ...p,
            variants: wantsVariants ? deriveMockProductVariants(p.id) : p.variants,
            inventory: wantsInventory ? deriveMockProductInventory(p.id, false) : p.inventory,
          }))
        }
        const collectionsArg = args?.include?.collections || args?.select?.collections
        if (collectionsArg) list = list.map((p: any) => ({ ...p, collections: joinProductCollections(p.id, collectionsArg) }))
        return list
      }
      if (model === 'category') {
        let list = [...mockCategories]
        const w = args?.where || {}
        // The homepage's top-level category grid, the shop page's active-category filter, the
        // admin nav editor's category picker, and the admin CSV export's category-id selector all
        // pass one of these -- without them, every one of these silently returned/exported the
        // whole category table regardless of isActive/parentId/id.in.
        if (w.isActive !== undefined) list = list.filter((c: any) => c.isActive === w.isActive)
        if (w.parentId !== undefined) list = list.filter((c: any) => c.parentId === w.parentId)
        if (w.id?.in) { const ids = new Set(w.id.in); list = list.filter((c: any) => ids.has(c.id)) }
        const orderBy = Array.isArray(args?.orderBy) ? args.orderBy : args?.orderBy ? [args.orderBy] : []
        if (orderBy.length) {
          list = list.sort((a: any, b: any) => {
            for (const clause of orderBy) {
              for (const [field, dir] of Object.entries(clause)) {
                const av = a[field] ?? 0; const bv = b[field] ?? 0
                if (av < bv) return dir === 'desc' ? 1 : -1
                if (av > bv) return dir === 'desc' ? -1 : 1
              }
            }
            return 0
          })
        }
        if (args?.take) list = list.slice(0, args.take)
        if (args?.include?._count?.select?.products) list = list.map((c: any) => ({ ...c, _count: { products: mockProducts.filter((p: any) => p.categoryId === c.id).length } }))
        if (args?.include?.parent) list = list.map((c: any) => ({ ...c, parent: c.parentId ? mockCategories.find((p: any) => p.id === c.parentId) || null : null }))
        return list
      }
      if (model === 'metafieldDefinition') {
        let list = [...mockMetafieldDefinitions]
        if (args?.where?.ownerType) list = list.filter((x: any) => x.ownerType === args.where.ownerType)
        const orderBy = args?.orderBy
        const orderKeys = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
        for (const key of [...orderKeys].reverse()) {
          if (key.ownerType === 'asc') list = [...list].sort((a: any, b: any) => a.ownerType.localeCompare(b.ownerType))
          else if (key.namespace === 'asc') list = [...list].sort((a: any, b: any) => a.namespace.localeCompare(b.namespace))
          else if (key.key === 'asc') list = [...list].sort((a: any, b: any) => a.key.localeCompare(b.key))
        }
        return list
      }
      if (model === 'mediaAsset') {
        let list = [...mockMediaAssets]
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'asc') list = list.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        return list
      }
      if (model === 'inventoryTransfer') {
        let list = [...mockInventoryTransfers]
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'asc') list = list.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        const includeArg = args?.include
        if (includeArg?.fromLocation) list = list.map((t: any) => ({ ...t, fromLocation: t.fromLocationId ? mockStoreLocations.find((l: any) => l.id === t.fromLocationId) || null : null }))
        if (includeArg?.toLocation) list = list.map((t: any) => ({ ...t, toLocation: t.toLocationId ? mockStoreLocations.find((l: any) => l.id === t.toLocationId) || null : null }))
        return list
      }
      if (model === 'collection') {
        let list = [...mockCollections]
        const w = args?.where || {}
        if (w.isActive !== undefined) list = list.filter((c: any) => c.isActive === w.isActive)
        if (w.id?.in) { const ids = new Set(w.id.in); list = list.filter((c: any) => ids.has(c.id)) }
        const orderBy = args?.orderBy
        const orderKeys = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
        for (const key of [...orderKeys].reverse()) {
          if (key.sortOrder === 'asc') list = [...list].sort((a: any, b: any) => a.sortOrder - b.sortOrder)
          else if (key.updatedAt === 'desc') list = [...list].sort((a: any, b: any) => b.updatedAt.getTime() - a.updatedAt.getTime())
          else if (key.name === 'asc') list = [...list].sort((a: any, b: any) => a.name.localeCompare(b.name))
        }
        if (args?.include?._count?.select?.products) list = list.map((c: any) => ({ ...c, _count: { ...(c._count || {}), products: deriveCollectionProducts(c.id).length } }))
        if (args?.include?.products) list = list.map((c: any) => ({ ...c, products: joinCollectionProducts(c.id, args.include.products) }))
        return list
      }
      if (model === 'order') {
        let list = [...mockOrders]
        const w = args?.where || {}
        if (w.createdAt?.gte) list = list.filter((o) => new Date(o.createdAt) >= new Date(w.createdAt.gte))
        if (w.createdAt?.lt) list = list.filter((o) => new Date(o.createdAt) < new Date(w.createdAt.lt))
        if (w.status?.not) list = list.filter((o) => o.status !== w.status.not)
        else if (typeof w.status === 'string') list = list.filter((o) => o.status === w.status)
        if (w.couponCode?.not === null) list = list.filter((o) => o.couponCode != null)
        if (w.userId?.in) { const ids = new Set(w.userId.in); list = list.filter((o) => ids.has(o.userId)) }
        if (typeof w.userId === 'string') list = list.filter((o) => o.userId === w.userId)
        // The admin orders list's search box builds where.OR over orderNumber/email/phone plus
        // a nested user.is.name relation filter -- without this, typing anything into the
        // search box returned the full unfiltered order list instead of matches.
        if (Array.isArray(w.OR)) {
          list = list.filter((o: any) => w.OR.some((cond: any) => {
            if (cond.user?.is?.name) {
              const user = mockUsers.find((u: any) => u.id === o.userId)
              return mockFieldContains(user?.name, cond.user.is.name)
            }
            return Object.entries(cond).some(([field, sub]) => mockFieldContains(o[field], sub))
          }))
        }
        if (args?.distinct?.includes('userId')) { const seen = new Set(); list = list.filter((o) => { if (seen.has(o.userId)) return false; seen.add(o.userId); return true }) }
        if (args?.orderBy?.createdAt === 'asc') list = list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        else if (args?.orderBy?.createdAt === 'desc') list = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        // The admin orders list's pagination relies on this -- without it, every page past
        // page 1 returned the same first `take` orders instead of the next slice.
        if (args?.skip) list = list.slice(args.skip)
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'coupon') {
        let list = [...mockCoupons]
        if (args?.where?.isActive !== undefined) list = list.filter((x) => x.isActive === args.where.isActive)
        if (args?.where?.isAutomatic !== undefined) list = list.filter((x) => Boolean(x.isAutomatic) === args.where.isAutomatic)
        if (args?.where?.code?.in) { const codes = new Set(args.where.code.in); list = list.filter((x) => codes.has(x.code)) }
        return list
      }
      if (model === 'shippingZone') {
        let list = [...mockShippingZones]
        const w = args?.where || {}
        if (w.isActive !== undefined) list = list.filter((x: any) => x.isActive === w.isActive)
        if (args?.orderBy?.name === 'asc') list = list.sort((a: any, b: any) => a.name.localeCompare(b.name))
        const ratesArg = args?.include?.rates
        if (ratesArg) {
          list = list.map((z: any) => {
            let rates = [...(z.rates || [])]
            if (ratesArg?.where?.isActive !== undefined) rates = rates.filter((r: any) => r.isActive === ratesArg.where.isActive)
            if (ratesArg?.orderBy?.price === 'asc') rates = rates.sort((a: any, b: any) => a.price - b.price)
            return { ...z, rates }
          })
        }
        return list
      }
      if (model === 'user') {
        let list = [...mockUsers]
        // The admin Users page, its API, and lib/push's staff-alert targeting all pass
        // role: { not: 'CUSTOMER' } to find staff accounts -- without this, the plain-equality
        // check below always compared a string role to that object and matched nothing, so
        // every one of those silently returned an empty staff list.
        if (args?.where?.role?.not !== undefined) list = list.filter((u) => u.role !== args.where.role.not)
        else if (args?.where?.role !== undefined) list = list.filter((u) => u.role === args.where.role)
        if (args?.where?.isActive !== undefined) list = list.filter((u) => u.isActive === args.where.isActive)
        if (args?.where?.id?.in) { const ids = new Set(args.where.id.in); list = list.filter((u) => ids.has(u.id)) }
        if (args?.where?.createdAt?.gte) list = list.filter((u) => new Date(u.createdAt) >= new Date(args.where.createdAt.gte))
        if (args?.where?.createdAt?.lt) list = list.filter((u) => new Date(u.createdAt) < new Date(args.where.createdAt.lt))
        // The admin customers list's Orders/Reviews columns and its "repeat customers" stat both
        // read _count off each row -- without deriving it from the real mockOrders/mockReviews
        // arrays, every customer showed 0 orders and 0 reviews no matter their real history.
        const countArg = args?.select?._count?.select || args?.include?._count?.select
        if (countArg) list = list.map((u) => ({ ...u, _count: { orders: mockOrders.filter((o: any) => o.userId === u.id).length, reviews: mockReviews.filter((r: any) => r.userId === u.id).length } }))
        return list
      }
      // Ignored args.where entirely -- every caller narrows this to a specific whitelist of keys
      // (payment config, public store settings, tracking pixels, the admin settings page's own
      // client-safe key list) and trusts that whitelist to keep secrets/other-user data out of
      // what it hands to the browser, so an unfiltered dump here was a real data-exposure gap in
      // mock/dev mode, not just a correctness nit.
      if (model === 'setting') {
        let list = Array.from(mockSettings.entries()).map(([key, value]) => ({ id: `set-${key}`, key, value }))
        const w = args?.where || {}
        if (w.key?.in) { const keys = new Set(w.key.in); list = list.filter((x) => keys.has(x.key)) }
        if (w.key?.startsWith) list = list.filter((x) => x.key.startsWith(w.key.startsWith))
        if (Array.isArray(w.NOT?.OR)) {
          const prefixes = w.NOT.OR.map((cond: any) => cond.key?.startsWith).filter((p: any) => typeof p === 'string')
          list = list.filter((x) => !prefixes.some((p: string) => x.key.startsWith(p)))
        }
        if (args?.orderBy?.key === 'asc') list = [...list].sort((a, b) => a.key.localeCompare(b.key))
        return list
      }
      if (model === 'themeVersion') {
        let list = [...mockThemeVersions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      // The 'New Purchase Order' and 'New Inventory Transfer' location pickers both scope this to
      // where: { status: 'ACTIVE' } -- without it, a location an admin disabled (the location-
      // delete flow's own "disable it instead" guidance) kept showing up as selectable on new POs
      // and transfers.
      if (model === 'storeLocation') {
        let list = [...mockStoreLocations]
        if (args?.where?.status !== undefined) list = list.filter((l: any) => l.status === args.where.status)
        return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
      }
      // The admin sales-channels list and the Operations Hub's "N products" summary both read
      // _count.publications off each row -- without deriving it from the real
      // mockProductPublications array (already filtered by channelId a few branches below for
      // productPublication.findMany), every channel showed 0 products even after a merchant
      // published products to it.
      if (model === 'salesChannel') return [...mockSalesChannels].map(c => ({ ...c, _count: { publications: mockProductPublications.filter((p: any) => p.channelId === c.id).length } }))
      if (model === 'webhookEndpoint') {
        let list = [...mockWebhookEndpoints]
        if (args?.where?.topic !== undefined) list = list.filter((x) => x.topic === args.where.topic)
        if (args?.where?.status !== undefined) list = list.filter((x) => x.status === args.where.status)
        return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      }
      if (model === 'apiCredential') return [...mockApiCredentials].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      if (model === 'fulfillment') {
        let list = [...mockFulfillments]
        if (args?.where?.orderId) list = list.filter((x) => x.orderId === args.where.orderId)
        list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.include?.lines) list = list.map((f) => ({ ...f, lines: mockFulfillmentLines.filter((l) => l.fulfillmentId === f.id) }))
        return list
      }
      if (model === 'taxRate') {
        let list = [...mockTaxRates]
        if (args?.where?.isActive !== undefined) list = list.filter((x) => x.isActive === args.where.isActive)
        return list.sort((a, b) => a.name.localeCompare(b.name))
      }
      if (model === 'walletTransaction') {
        let list = [...mockWalletTransactions]
        const w = args?.where || {}
        if (w.userId) list = list.filter((x) => x.userId === w.userId)
        if (w.currency) list = list.filter((x) => x.currency === w.currency)
        if (w.type) list = list.filter((x) => x.type === w.type)
        if (w.referenceId) list = list.filter((x) => x.referenceId === w.referenceId)
        list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'abandonedCheckout') {
        let list = [...mockAbandonedCheckouts]
        if (args?.where?.status) list = list.filter((x) => x.status === args.where.status)
        list = list.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'coinTransaction') {
        let list = [...mockCoinTransactions]
        if (args?.where?.userId) list = list.filter((x) => x.userId === args.where.userId)
        list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'giftCard') {
        let list = [...mockGiftCards]
        if (args?.where?.note) list = list.filter((x) => x.note === args.where.note)
        return list
      }
      if (model === 'inventoryItem') {
        let list = [...mockInventoryItems]
        const w = args?.where || {}
        if (w.productId) list = list.filter((x) => x.productId === w.productId)
        // variantId is used both ways here -- a specific id (this variant's own rows) and
        // null (the product-level pool, explicitly excluding every variant's rows) -- so
        // `undefined` (not filtering on it at all) has to stay distinguishable from `null`.
        if (w.variantId !== undefined) list = list.filter((x) => x.variantId === w.variantId)
        if (w.id?.in) { const ids = new Set(w.id.in); list = list.filter((x) => ids.has(x.id)) }
        // The admin Inventory page's lowest-stock-first triage sort -- without it, rows came
        // back in raw insertion order regardless of `orderBy`.
        const orderClauses = Array.isArray(args?.orderBy) ? args.orderBy : args?.orderBy ? [args.orderBy] : []
        for (const clause of [...orderClauses].reverse()) {
          const [field, dir] = Object.entries(clause)[0] as [string, string]
          list = [...list].sort((a: any, b: any) => {
            const av = (a as any)[field]; const bv = (b as any)[field]
            const cmp = av < bv ? -1 : av > bv ? 1 : 0
            return dir === 'desc' ? -cmp : cmp
          })
        }
        // Every real caller (admin inventory list, low-stock push alerts, the analytics
        // report's valuation/lowStock cards) asks for product/variant/location/movements via
        // include or select -- join them the same way findUnique/findUniqueOrThrow now do,
        // rather than leaving them undefined and showing every row as "Unassigned" with no
        // movement history.
        const relationsArg = args?.include || args?.select
        if (relationsArg?.product || relationsArg?.variant || relationsArg?.location || relationsArg?.movements) {
          list = list.map((x) => joinMockInventoryItem(x, relationsArg))
        }
        return list
      }
      if (model === 'customerTag') return [...mockCustomerTags].sort((a, b) => a.value.localeCompare(b.value))
      if (model === 'customerTagMember') {
        let list = [...mockCustomerTagMembers]
        const w = args?.where || {}
        if (w.tagId) list = list.filter((x) => x.tagId === w.tagId)
        if (typeof w.customerId === 'string') list = list.filter((x) => x.customerId === w.customerId)
        if (w.customerId?.in) { const ids = new Set(w.customerId.in); list = list.filter((x) => ids.has(x.customerId)) }
        list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.include?.tag) list = list.map((x) => ({ ...x, tag: mockCustomerTags.find((t) => t.id === x.tagId) || null }))
        return list
      }
      if (model === 'customerSegment') return [...mockCustomerSegments].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      if (model === 'customerSegmentMember') {
        let list = [...mockCustomerSegmentMembers]
        const w = args?.where || {}
        if (w.segmentId) list = list.filter((x) => x.segmentId === w.segmentId)
        if (typeof w.customerId === 'string') list = list.filter((x) => x.customerId === w.customerId)
        if (w.customerId?.in) { const ids = new Set(w.customerId.in); list = list.filter((x) => ids.has(x.customerId)) }
        if (args?.orderBy?.addedAt === 'desc') list = list.sort((a, b) => (b.addedAt ?? b.createdAt).getTime() - (a.addedAt ?? a.createdAt).getTime())
        // The admin customer-detail page's `segments: segmentMembers.map(x => x.segment)` relies
        // on this include, the same way customerTagMember's `include.tag` already does above --
        // without it, every row's `.segment` was undefined, which serialized to `null` in the
        // response array and crashed the client component the moment it called `.id` on that null
        // entry, for any customer belonging to at least one segment.
        if (args?.include?.segment) list = list.map((x) => ({ ...x, segment: mockCustomerSegments.find((s) => s.id === x.segmentId) || null }))
        return list
      }
      // lib/sales-channels.ts's getUnpublishedProductIds() calls this unscoped on every
      // storefront/checkout/sitemap request with a nested `channel.handle` filter -- without
      // a real branch here it always returned [], so unpublishing a product from the admin
      // toggle silently never hid it anywhere despite the toggle reporting success.
      if (model === 'productPublication') {
        let list = [...mockProductPublications]
        const w = args?.where || {}
        if (w.productId) list = list.filter((x) => x.productId === w.productId)
        if (w.channelId) list = list.filter((x) => x.channelId === w.channelId)
        if (w.available !== undefined) list = list.filter((x) => x.available === w.available)
        if (w.channel?.handle) list = list.filter((x) => mockSalesChannels.find((c) => c.id === x.channelId)?.handle === w.channel.handle)
        if (args?.include?.channel) list = list.map((x) => ({ ...x, channel: mockSalesChannels.find((c) => c.id === x.channelId) || null }))
        if (args?.orderBy?.channel?.name) {
          const dir = args.orderBy.channel.name === 'desc' ? -1 : 1
          list = list.sort((a, b) => dir * String(mockSalesChannels.find((c) => c.id === a.channelId)?.name || '').localeCompare(String(mockSalesChannels.find((c) => c.id === b.channelId)?.name || '')))
        }
        return list
      }
      if (model === 'homepageBlock') {
        let list = [...mockHomepageBlocks]
        const w = args?.where || {}
        if (w.isActive !== undefined) list = list.filter((x) => x.isActive === w.isActive)
        if (w.type?.in) { const types = new Set(w.type.in); list = list.filter((x) => types.has(x.type)) }
        list.sort((a, b) => a.sortOrder - b.sortOrder)
        return list
      }
      if (model === 'review') {
        let list = [...mockReviews]
        const w = args?.where || {}
        if (w.approved !== undefined) list = list.filter((r) => r.approved === w.approved)
        if (w.productId) list = list.filter((r) => r.productId === w.productId)
        if (w.userId) list = list.filter((r) => r.userId === w.userId)
        if (args?.orderBy?.featured === 'desc') list = list.sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.getTime() - a.createdAt.getTime())
        else list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        if (args?.include?.product) list = list.map((r) => ({ ...r, product: mockProducts.find((p) => p.id === r.productId) || null }))
        if (args?.include?.user) list = list.map((r) => ({ ...r, user: mockUsers.find((u) => u.id === r.userId) || null }))
        return list
      }
      if (model === 'wishlistItem') {
        let list = [...mockWishlistItems]
        const w = args?.where || {}
        if (w.userId) list = list.filter((x) => x.userId === w.userId)
        if (w.product?.status) list = list.filter((x) => mockProducts.find((p) => p.id === x.productId)?.status === w.product.status)
        list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.include?.product || args?.select?.product) list = list.map((x) => ({ ...x, product: mockProducts.find((p) => p.id === x.productId) || null }))
        return list
      }
      if (model === 'blog') return [...mockBlogs]
      if (model === 'blogPost') {
        let list = [...mockBlogPosts]
        const w = args?.where || {}
        if (w.status) list = list.filter((x) => x.status === w.status)
        if (args?.orderBy?.publishedAt === 'desc') list = list.sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0))
        else list = list.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0))
        return list
      }
      if (model === 'page') {
        let list = [...mockPages]
        const w = args?.where || {}
        if (w.status) list = list.filter((x: any) => x.status === w.status)
        if (args?.orderBy?.updatedAt === 'desc') list = list.sort((a: any, b: any) => b.updatedAt.getTime() - a.updatedAt.getTime())
        return list
      }
      if (model === 'redirect') {
        let list = [...mockRedirects]
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        return list
      }
      if (model === 'auditLog') {
        let list = filterMockAuditLogs(args?.where).sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.distinct?.includes('entity')) {
          const seen = new Set<string>()
          list = list.filter((x: any) => { if (seen.has(x.entity)) return false; seen.add(x.entity); return true }).sort((a: any, b: any) => a.entity.localeCompare(b.entity))
          return list.map((x: any) => ({ entity: x.entity }))
        }
        if (args?.skip) list = list.slice(args.skip)
        if (args?.take) list = list.slice(0, args.take)
        if (args?.include?.actor) list = list.map((x: any) => ({ ...x, actor: mockUsers.find((u: any) => u.id === x.actorId) || null }))
        return list
      }
      if (model === 'inventoryMovement') {
        let list = [...mockInventoryMovements]
        const w = args?.where || {}
        if (w.type) list = list.filter((x: any) => x.type === w.type)
        if (w.referenceId) list = list.filter((x: any) => x.referenceId === w.referenceId)
        if (w.inventoryId) list = list.filter((x: any) => x.inventoryId === w.inventoryId)
        if (args?.orderBy?.createdAt === 'asc') list = list.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        return list
      }
      if (model === 'address') {
        let list = mockAddresses.filter((x: any) => x.userId === args?.where?.userId)
        if (args?.orderBy?.isDefault === 'desc') list = list.sort((a: any, b: any) => Number(b.isDefault) - Number(a.isDefault))
        return list
      }
      if (model === 'returnRequest') {
        let list = [...mockReturnRequests]
        const w = args?.where || {}
        if (w.orderId) list = list.filter((x: any) => x.orderId === w.orderId)
        if (typeof w.status === 'string') list = list.filter((x: any) => x.status === w.status)
        if (w.status?.notIn) { const excluded = new Set(w.status.notIn); list = list.filter((x: any) => !excluded.has(x.status)) }
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'asc') list = list.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'notification') {
        let list = mockNotifications.filter((x: any) => x.userId === args?.where?.userId)
        list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.skip) list = list.slice(args.skip)
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'draftOrder') {
        let list = [...mockDraftOrders]
        const w = args?.where || {}
        if (typeof w.status === 'string') list = list.filter((x: any) => x.status === w.status)
        if (Array.isArray(w.OR)) {
          const conditions: any[] = w.OR
          list = list.filter((x: any) => conditions.some((cond) => Object.entries(cond).some(([field, sub]) => mockFieldContains((x as any)[field], sub))))
        }
        list = list.sort((a: any, b: any) => b.updatedAt.getTime() - a.updatedAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'purchaseOrder') {
        let list = [...mockPurchaseOrders]
        const w = args?.where || {}
        if (typeof w.status === 'string') list = list.filter((x: any) => x.status === w.status)
        list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        if (args?.include?.items) list = list.map((po: any) => ({ ...po, items: derivePurchaseOrderItems(po.id) }))
        if (args?.include?.location) list = list.map((po: any) => ({ ...po, location: po.locationId ? mockStoreLocations.find((l: any) => l.id === po.locationId) || null : null }))
        return list
      }
      if (model === 'purchaseOrderItem') {
        let list = [...mockPurchaseOrderItems]
        if (args?.where?.purchaseOrderId) list = list.filter((x: any) => x.purchaseOrderId === args.where.purchaseOrderId)
        return list
      }
      if (model === 'orderEdit') {
        let list = [...mockOrderEdits]
        if (args?.where?.orderId) list = list.filter((x: any) => x.orderId === args.where.orderId)
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      if (model === 'orderItem') {
        const w = args?.where || {}
        if (w.orderId) return [...(mockOrders.find((o: any) => o.id === w.orderId)?.items || [])]
        return mockOrders.flatMap((o: any) => o.items || [])
      }
      if (model === 'productVariant') {
        let list = [...mockProductVariants]
        const w = args?.where || {}
        if (w.id?.in) { const ids = new Set(w.id.in); list = list.filter((v: any) => ids.has(v.id)) }
        else if (typeof w.id === 'string') list = list.filter((v: any) => v.id === w.id)
        if (w.productId?.in) { const ids = new Set(w.productId.in); list = list.filter((v: any) => ids.has(v.productId)) }
        else if (typeof w.productId === 'string') list = list.filter((v: any) => v.productId === w.productId)
        return list
      }
      if (model === 'liveVisitorSession') {
        let list = Array.from(mockLiveVisitorSessions.values())
        if (args?.where?.lastSeenAt?.gte) list = list.filter((v) => v.lastSeenAt >= new Date(args.where.lastSeenAt.gte))
        if (args?.where?.lastSeenAt?.lt) list = list.filter((v) => v.lastSeenAt < new Date(args.where.lastSeenAt.lt))
        if (args?.where?.userId?.in) { const ids = new Set(args.where.userId.in); list = list.filter((v) => ids.has(v.userId)) }
        list = list.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
        if (args?.take) list = list.slice(0, args.take)
        return list
      }
      return []
    },
    findUnique: async (args: any) => {
      const where = args?.where || {}
      if (model === 'paymentTransaction' && where.id) {
        return findMockPaymentTransaction(where)?.transaction || null
      }
      if (model === 'setting' && where.key) {
        const val = mockSettings.get(where.key)
        return val ? { id: `set-${where.key}`, key: where.key, value: val } : null
      }
      if (model === 'product') {
        const found = where.id
          ? mockProducts.find((p) => p.id === where.id)
          : where.slug
            ? mockProducts.find((p) => p.slug === where.slug)
            : where.sku
              ? mockProducts.find((p) => p.sku === where.sku)
              : where.barcode
                ? mockProducts.find((p) => (p as any).barcode === where.barcode)
                : undefined
        if (!found) return null
        // mockProducts entries don't carry every relation Prisma's `include` can ask
        // for (e.g. reviews, tags, metafields) -- default those to empty arrays so callers
        // that assume Prisma's always-an-array shape (never undefined) don't crash (the PDP's
        // `product.metafields.filter(...)` has no optional chaining and would throw outright).
        // reviews/variants/inventory are real lookups against their own mock arrays (rather
        // than a stale embedded stub) so create/update actually round-trip in mock/dev mode.
        let reviews: any[] = []
        const reviewsArg = args?.include?.reviews
        if (reviewsArg) {
          reviews = mockReviews.filter((r) => r.productId === found.id && (reviewsArg.where?.approved === undefined || r.approved === reviewsArg.where.approved))
          if (reviewsArg.orderBy?.featured === 'desc') reviews = reviews.sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.getTime() - a.createdAt.getTime())
          else reviews = reviews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          if (reviewsArg.take) reviews = reviews.slice(0, reviewsArg.take)
          if (reviewsArg.include?.user) reviews = reviews.map((r) => ({ ...r, user: mockUsers.find((u) => u.id === r.userId) || null }))
        }
        const inventoryArg = args?.include?.inventory
        const sharedOnly = Boolean(inventoryArg && typeof inventoryArg === 'object' && inventoryArg.where?.variantId === null)
        const collectionsArg = args?.include?.collections
        const metafieldsArg = args?.include?.metafields
        let metafields: any[] = []
        if (metafieldsArg) {
          metafields = mockMetafieldValues.filter((v: any) => v.ownerType === 'PRODUCT' && v.ownerId === found.id)
          if (metafieldsArg.include?.definition) metafields = metafields.map((v: any) => ({ ...v, definition: mockMetafieldDefinitions.find((d: any) => d.id === v.definitionId) || null }))
        }
        return {
          reviews, tags: [], metafields, ...found,
          images: [...(found.images || [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
          variants: deriveMockProductVariants(found.id),
          inventory: deriveMockProductInventory(found.id, sharedOnly),
          ...(collectionsArg ? { collections: joinProductCollections(found.id, collectionsArg) } : {}),
        }
      }
      if (model === 'user') {
        if (where.email) return mockUsers.find((u) => u.email.toLowerCase() === String(where.email).toLowerCase()) || null
        if (where.id) return mockUsers.find((u) => u.id === where.id) || null
      }
      if (model === 'category') {
        const found = where.slug ? mockCategories.find((c: any) => c.slug === where.slug) : where.id ? mockCategories.find((c: any) => c.id === where.id) : undefined
        if (!found) return null
        // Category delete's cascade check reads _count.products/_count.children before deciding
        // whether/how to clear orphaned references -- without this, that read threw a TypeError
        // on the missing _count instead of the intended SetNull-style cleanup ever running.
        if (args?.include?._count?.select) {
          const result: any = { ...found, _count: {} }
          if (args.include._count.select.products) result._count.products = mockProducts.filter((p: any) => p.categoryId === found.id).length
          if (args.include._count.select.children) result._count.children = mockCategories.filter((c: any) => c.parentId === found.id).length
          return result
        }
        return found
      }
      if (model === 'collection') {
        const found = where.slug ? mockCollections.find((c: any) => c.slug === where.slug) : where.id ? mockCollections.find((c: any) => c.id === where.id) : undefined
        if (!found) return null
        if (args?.include?.products) return { ...found, products: joinCollectionProducts(found.id, args.include.products) }
        return found
      }
      if (model === 'coupon' && where.code) return mockCoupons.find((c) => c.code.toUpperCase() === String(where.code).toUpperCase()) || null
      if (model === 'adminLoginLockout' && where.email) return mockAdminLoginLockouts.get(where.email) || null
      if (model === 'themeVersion' && where.id) return mockThemeVersions.find((v) => v.id === where.id) || null
      if (model === 'storeLocation') return (where.id ? mockStoreLocations.find((x) => x.id === where.id) : where.handle ? mockStoreLocations.find((x) => x.handle === where.handle) : null) || null
      if (model === 'salesChannel') return (where.id ? mockSalesChannels.find((x) => x.id === where.id) : where.handle ? mockSalesChannels.find((x) => x.handle === where.handle) : null) || null
      if (model === 'webhookEndpoint' && where.id) return mockWebhookEndpoints.find((x) => x.id === where.id) || null
      if (model === 'apiCredential') return (where.id ? mockApiCredentials.find((x) => x.id === where.id) : where.keyHash ? mockApiCredentials.find((x) => x.keyHash === where.keyHash) : null) || null
      if (model === 'taxRate' && where.id) return mockTaxRates.find((x) => x.id === where.id) || null
      if (model === 'abandonedCheckout') return (where.id ? mockAbandonedCheckouts.find((x) => x.id === where.id) : where.token ? mockAbandonedCheckouts.find((x) => x.token === where.token) : null) || null
      if (model === 'coinTransaction' && where.id) return mockCoinTransactions.find((x) => x.id === where.id) || null
      if (model === 'giftCard') return (where.id ? mockGiftCards.find((x) => x.id === where.id) : where.code ? mockGiftCards.find((x) => x.code.toUpperCase() === String(where.code).toUpperCase()) : null) || null
      if (model === 'productVariant') return (where.id ? mockProductVariants.find((x) => x.id === where.id) : where.sku ? mockProductVariants.find((x) => x.sku === where.sku) : where.barcode ? mockProductVariants.find((x) => x.barcode === where.barcode) : null) || null
      if (model === 'inventoryItem' && where.id) {
        const found = mockInventoryItems.find((x) => x.id === where.id)
        if (!found) return null
        // The manual-adjustment route's post-write re-read (and findUniqueOrThrow below) asks
        // for product/variant/location/movements the same way -- without joining them here,
        // every field beyond the bare row stayed undefined.
        return joinMockInventoryItem(found, args?.include || args?.select)
      }
      if (model === 'homepageBlock' && where.id) return mockHomepageBlocks.find((x) => x.id === where.id) || null
      if (model === 'blogPost') return (where.id ? mockBlogPosts.find((x) => x.id === where.id) : where.handle ? mockBlogPosts.find((x) => x.handle === where.handle) : null) || null
      if (model === 'page') return (where.id ? mockPages.find((x: any) => x.id === where.id) : where.handle ? mockPages.find((x: any) => x.handle === where.handle) : null) || null
      // The single highest-traffic lookup on this model: proxy.ts's request-routing middleware
      // calls this by fromPath on every single storefront request to decide whether to 308
      // redirect -- without a real branch here it always returned null, so no merchant-configured
      // redirect ever actually fired on the live site.
      if (model === 'redirect') return (where.id ? mockRedirects.find((x: any) => x.id === where.id) : where.fromPath ? mockRedirects.find((x: any) => x.fromPath === where.fromPath) : null) || null
      if (model === 'wishlistItem') {
        if (where.id) return mockWishlistItems.find((x) => x.id === where.id) || null
        if (where.userId_productId) { const { userId, productId } = where.userId_productId; return mockWishlistItems.find((x) => x.userId === userId && x.productId === productId) || null }
        return null
      }
      if (model === 'customerTag') return (where.id ? mockCustomerTags.find((x) => x.id === where.id) : where.value ? mockCustomerTags.find((x) => x.value === where.value) : null) || null
      if (model === 'customerTagMember' && where.tagId_customerId) {
        const { tagId, customerId } = where.tagId_customerId
        return mockCustomerTagMembers.find((x) => x.tagId === tagId && x.customerId === customerId) || null
      }
      if (model === 'customerSegment' && where.id) return mockCustomerSegments.find((x) => x.id === where.id) || null
      if (model === 'customerSegmentMember' && where.segmentId_customerId) {
        const { segmentId, customerId } = where.segmentId_customerId
        return mockCustomerSegmentMembers.find((x) => x.segmentId === segmentId && x.customerId === customerId) || null
      }
      if (model === 'fulfillment' && where.id) {
        const f = mockFulfillments.find((x) => x.id === where.id)
        return f ? { ...f, lines: mockFulfillmentLines.filter((l) => l.fulfillmentId === f.id) } : null
      }
      if (model === 'order') {
        const found = where.orderNumber
          ? mockOrders.find((o) => o.orderNumber === where.orderNumber)
          : where.id
            ? mockOrders.find((o) => o.id === where.id)
            : undefined
        if (!found) return null
        // fulfillOrderStock (lib/inventory.ts) needs each item's own product (for
        // trackInventory/continueSellingWhenOutOfStock) -- order.items are embedded plain
        // rows from order.create's own nested-write expansion, so joining `.product` in only
        // has to happen when actually requested, same idea as product's own derived relations.
        const itemsArg = args?.include?.items
        const items = (itemsArg?.include?.product || itemsArg?.include?.variant)
          ? (found.items || []).map((it: any) => ({
              ...it,
              ...(itemsArg.include.product ? { product: mockProducts.find((p: any) => p.id === it.productId) || null } : {}),
              ...(itemsArg.include.variant ? { variant: it.variantId ? mockProductVariants.find((v: any) => v.id === it.variantId) || null : null } : {}),
            }))
          : found.items
        // notesHistory is embedded on the order row by orderNote.create (see below) -- join
        // `.user` in and honor createdAt orderBy only when actually requested, same as items above.
        const notesArg = args?.include?.notesHistory
        let notesHistory = found.notesHistory || []
        if (notesArg) {
          if (notesArg.include?.user) notesHistory = notesHistory.map((n: any) => ({ ...n, user: mockUsers.find((u: any) => u.id === n.userId) || null }))
          if (notesArg.orderBy?.createdAt === 'desc') notesHistory = [...notesHistory].sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
          else if (notesArg.orderBy?.createdAt === 'asc') notesHistory = [...notesHistory].sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        }
        return { events: [], paymentTransactions: [], ...found, items, notesHistory }
      }
      if (model === 'returnRequest' && where.id) return mockReturnRequests.find((x: any) => x.id === where.id) || null
      if (model === 'draftOrder' && where.id) return mockDraftOrders.find((x: any) => x.id === where.id) || null
      if (model === 'inventoryTransfer' && where.id) {
        const found = mockInventoryTransfers.find((x: any) => x.id === where.id)
        if (!found) return null
        const includeArg = args?.include
        return {
          ...found,
          ...(includeArg?.fromLocation ? { fromLocation: found.fromLocationId ? mockStoreLocations.find((l: any) => l.id === found.fromLocationId) || null : null } : {}),
          ...(includeArg?.toLocation ? { toLocation: found.toLocationId ? mockStoreLocations.find((l: any) => l.id === found.toLocationId) || null : null } : {}),
        }
      }
      if (model === 'passwordResetToken' && where.tokenHash) return mockPasswordResetTokens.find((x: any) => x.tokenHash === where.tokenHash) || null
      if (model === 'shippingZone' && where.id) {
        const zone = mockShippingZones.find((x: any) => x.id === where.id)
        if (!zone) return null
        const ratesArg = args?.include?.rates
        if (!ratesArg) return zone
        let rates = [...(zone.rates || [])]
        if (ratesArg?.where?.isActive !== undefined) rates = rates.filter((r: any) => r.isActive === ratesArg.where.isActive)
        if (ratesArg?.orderBy?.price === 'asc') rates = rates.sort((a: any, b: any) => a.price - b.price)
        return { ...zone, rates }
      }
      if (model === 'purchaseOrder' && where.id) {
        const po = mockPurchaseOrders.find((x: any) => x.id === where.id)
        if (!po) return null
        const result: any = { ...po }
        if (args?.include?.items) result.items = derivePurchaseOrderItems(po.id)
        if (args?.include?.location) result.location = po.locationId ? mockStoreLocations.find((l: any) => l.id === po.locationId) || null : null
        return result
      }
      if (model === 'orderEdit' && where.id) return mockOrderEdits.find((x: any) => x.id === where.id) || null
      // The single highest-traffic lookup on this model: the customer-facing /track/[token]
      // page and its polling API call this by trackingToken on every page load/poll to decide
      // whether to show live position -- without a real branch here it always returned null,
      // so the public tracking link staff shared with a customer always 404'd.
      if (model === 'deliveryTracking') {
        if (where.trackingToken) return mockDeliveryTracking.find((x: any) => x.trackingToken === where.trackingToken) || null
        if (where.orderId) return mockDeliveryTracking.find((x: any) => x.orderId === where.orderId) || null
        return null
      }
      return null
    },
    findFirst: async (args?: any) => {
      const where = args?.where || {}
      if (model === 'review') {
        const list = mockReviews.filter((r) => (where.productId === undefined || r.productId === where.productId) && (where.userId === undefined || r.userId === where.userId) && (where.approved === undefined || r.approved === where.approved))
        return list[0] || null
      }
      if (model === 'blog') return mockBlogs[0] || null
      // lib/sales-channels.ts's isProductPublished() -- the product detail page's own
      // gate, checked separately from the list-wide getUnpublishedProductIds() above.
      if (model === 'productPublication') {
        let list = mockProductPublications.filter((x: any) => (where.productId === undefined || x.productId === where.productId) && (where.available === undefined || x.available === where.available))
        if (where.channel?.handle) list = list.filter((x: any) => mockSalesChannels.find((c) => c.id === x.channelId)?.handle === where.channel.handle)
        return list[0] || null
      }
      if (model === 'order') {
        // No findFirst branch existed for 'order' at all -- every caller (the return-request
        // create/cancel routes' orderNumber+userId ownership lookup, checkout's own
        // userId+status.not duplicate-pending-order check, order cancel's ownership lookup)
        // always got null back, regardless of include, matching this mock's own generic
        // fallback. items/paymentTransactions are already embedded on the row from
        // order.create/paymentTransaction.create, same as order.findUnique already returns.
        let list = [...mockOrders]
        if (where.orderNumber) list = list.filter((o: any) => o.orderNumber === where.orderNumber)
        if (where.id) list = list.filter((o: any) => o.id === where.id)
        if (where.userId) list = list.filter((o: any) => o.userId === where.userId)
        if (where.status?.not) list = list.filter((o: any) => o.status !== where.status.not)
        else if (typeof where.status === 'string') list = list.filter((o: any) => o.status === where.status)
        const found = list[0]
        return found ? { events: [], notesHistory: [], paymentTransactions: [], ...found } : null
      }
      if (model === 'address') {
        let list = mockAddresses.filter((x: any) => (where.id === undefined || x.id === where.id) && (where.userId === undefined || x.userId === where.userId))
        if (args?.orderBy?.createdAt === 'asc') list = list.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        return list[0] || null
      }
      if (model === 'notification') {
        return mockNotifications.find((x: any) => (where.id === undefined || x.id === where.id) && (where.userId === undefined || x.userId === where.userId)) || null
      }
      if (model === 'inventoryMovement') {
        let list = mockInventoryMovements.filter((x: any) => (where.type === undefined || x.type === where.type) && (where.referenceId === undefined || x.referenceId === where.referenceId) && (where.inventoryId === undefined || x.inventoryId === where.inventoryId))
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'asc') list = list.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        return list[0] || null
      }
      // Used by app/api/reviews/route.ts's verified-purchase check -- without this, every
      // review submission was silently rejected as "not a verified purchase" regardless of
      // whether the customer actually bought the product.
      if (model === 'orderItem') {
        const w = where || {}
        const matchingOrders = mockOrders.filter((o: any) => (w.order?.userId === undefined || o.userId === w.order.userId) && (!w.order?.status?.in || w.order.status.in.includes(o.status)))
        for (const o of matchingOrders) {
          const item = (o.items || []).find((it: any) => w.productId === undefined || it.productId === w.productId)
          if (item) return item
        }
        return null
      }
      if (model === 'paymentTransaction') {
        let matches = findMockPaymentTransactions(where)
        if (args?.orderBy?.createdAt === 'desc') matches = matches.sort((a, b) => b.transaction.createdAt.getTime() - a.transaction.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'asc') matches = matches.sort((a, b) => a.transaction.createdAt.getTime() - b.transaction.createdAt.getTime())
        const match = matches[0]
        if (!match) return null
        if (args?.include?.order) return { ...match.transaction, order: match.order }
        return match.transaction
      }
      if (model === 'setting' && where.key) {
        const val = mockSettings.get(where.key)
        return val ? { id: `set-${where.key}`, key: where.key, value: val } : null
      }
      if (model === 'user') {
        const user = where.email
          ? mockUsers.find((u) => u.email.toLowerCase() === String(where.email).toLowerCase())
          : where.id
            ? mockUsers.find((u) => u.id === where.id)
            : mockUsers[0]
        if (!user) return null
        // OrderNote.userId is the staff author, not the order's customer -- notes are embedded
        // per-order (see orderNote.create above), so "notes this user authored" means scanning
        // every order's notesHistory for rows with this userId, same reverse-lookup shape as
        // orderItem.groupBy scanning every order's items below.
        const notesArg = args?.select?.orderNotes || args?.include?.orderNotes
        let orderNotes: any[] = notesArg ? mockOrders.flatMap((o: any) => (o.notesHistory || []).filter((n: any) => n.userId === user.id)) : []
        if (notesArg?.orderBy?.createdAt === 'desc') orderNotes = orderNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        else if (notesArg?.orderBy?.createdAt === 'asc') orderNotes = orderNotes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        if (notesArg?.take) orderNotes = orderNotes.slice(0, notesArg.take)
        if (notesArg?.select?.user) orderNotes = orderNotes.map((n) => ({ ...n, user: { name: mockUsers.find((u) => u.id === n.userId)?.name ?? null } }))
        // The admin customer-detail page joins orders/addresses/reviews/_count in on this exact
        // call -- without actually deriving them from the real mockOrders/mockAddresses/
        // mockReviews arrays (items/paymentTransactions are already embedded per-order by
        // order.create, so no further join is needed there), every customer showed $0 total
        // spent, no order history, no addresses, and no reviews, and _count always read 0.
        const ordersArg = args?.select?.orders || args?.include?.orders
        let orders: any[] = ordersArg ? mockOrders.filter((o: any) => o.userId === user.id) : []
        if (ordersArg?.orderBy?.createdAt === 'desc') orders = orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        else if (ordersArg?.orderBy?.createdAt === 'asc') orders = orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

        const addressesArg = args?.select?.addresses || args?.include?.addresses
        let addresses: any[] = addressesArg ? mockAddresses.filter((a: any) => a.userId === user.id) : []
        const addressOrderBy = Array.isArray(addressesArg?.orderBy) ? addressesArg.orderBy : addressesArg?.orderBy ? [addressesArg.orderBy] : []
        for (const key of [...addressOrderBy].reverse()) {
          if (key.createdAt === 'desc') addresses = [...addresses].sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
          else if (key.createdAt === 'asc') addresses = [...addresses].sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
          else if (key.isDefault === 'desc') addresses = [...addresses].sort((a: any, b: any) => Number(b.isDefault) - Number(a.isDefault))
        }

        const reviewsArg = args?.select?.reviews || args?.include?.reviews
        let reviews: any[] = reviewsArg ? mockReviews.filter((r: any) => r.userId === user.id) : []
        if (reviewsArg?.orderBy?.createdAt === 'desc') reviews = reviews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        else if (reviewsArg?.orderBy?.createdAt === 'asc') reviews = reviews.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        if (reviewsArg?.include?.product || reviewsArg?.select?.product) reviews = reviews.map((r) => ({ ...r, product: mockProducts.find((p: any) => p.id === r.productId) || null }))

        const countArg = args?.select?._count?.select || args?.include?._count?.select
        const orderCount = mockOrders.filter((o: any) => o.userId === user.id).length
        const reviewCount = mockReviews.filter((r: any) => r.userId === user.id).length
        const _count = countArg ? { orders: orderCount, reviews: reviewCount } : { orders: 0, reviews: 0 }

        // Included relations must come back as arrays, never undefined, or every caller that
        // reduces/maps over them (e.g. sumCustomerSpend on the customer detail page) crashes --
        // the real Prisma client always returns an empty array for an included relation with no
        // rows.
        return { orders, addresses, reviews, _count, ...user, orderNotes }
      }
      if (model === 'walletTransaction') {
        let list = [...mockWalletTransactions]
        const w = args?.where || {}
        if (w.userId) list = list.filter((x) => x.userId === w.userId)
        if (w.currency) list = list.filter((x) => x.currency === w.currency)
        if (w.type) list = list.filter((x) => x.type === w.type)
        if (w.referenceId) list = list.filter((x) => x.referenceId === w.referenceId)
        if (args?.orderBy?.createdAt === 'desc') list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return list[0] || null
      }
      if (model === 'shippingZone') {
        if (where.name !== undefined) return mockShippingZones.find((x: any) => x.name === where.name) || null
        if (where.id !== undefined) return mockShippingZones.find((x: any) => x.id === where.id) || null
        return mockShippingZones[0] || null
      }
      // Both real callers use this as an idempotency guard before crediting/debiting coins --
      // checkout's restoreCheckoutCoins (userId+referenceId+type: 'REVERSAL') before reversing a
      // failed payment-init spend, and the admin manual coin-adjustment endpoint
      // (userId+referenceId+type: CREDIT/DEBIT) before applying a retried request. Without a real
      // branch this always returned null, so a retried failed payment or a double-click admin
      // adjustment created a second coinTransaction instead of being deduped -- coins credited or
      // debited twice for what should have been a single change.
      if (model === 'coinTransaction') {
        let list = [...mockCoinTransactions]
        const w = args?.where || {}
        if (w.userId) list = list.filter((x) => x.userId === w.userId)
        if (w.referenceId) list = list.filter((x) => x.referenceId === w.referenceId)
        if (w.type) list = list.filter((x) => x.type === w.type)
        if (args?.orderBy?.createdAt === 'asc') list = list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        else if (args?.orderBy?.createdAt === 'desc') list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return list[0] || null
      }
      // Used by the public product-detail endpoint's findPublicProduct() (id/slug + status:
      // 'ACTIVE') and by the review/wishlist "product exists and is active" gates (id + status)
      // -- without real where/status filtering here, every product page resolved to whichever
      // product happened to be mockProducts[0], and the review/wishlist existence checks always
      // passed for any productId as long as any product existed, letting reviews/wishlist rows
      // attach to a nonexistent or inactive productId.
      if (model === 'product') {
        let candidates: any[] = mockProducts
        if (where.id) candidates = candidates.filter((p: any) => p.id === where.id)
        else if (where.slug) candidates = candidates.filter((p: any) => p.slug === where.slug)
        else if (where.sku) candidates = candidates.filter((p: any) => p.sku === where.sku)
        else if (where.barcode) candidates = candidates.filter((p: any) => p.barcode === where.barcode)
        if (where.status) candidates = candidates.filter((p: any) => p.status === where.status)
        const found = candidates[0]
        if (!found) return null
        // Same include-vs-select gap as product.findMany above -- the public product API's
        // findPublicProduct() requests collections via `select`, not `include`.
        const collectionsArg = args?.include?.collections || args?.select?.collections
        return {
          tags: [], metafields: [], ...found,
          images: [...(found.images || [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
          variants: deriveMockProductVariants(found.id),
          inventory: deriveMockProductInventory(found.id, false),
          ...(collectionsArg ? { collections: joinProductCollections(found.id, collectionsArg) } : {}),
        }
      }
      if (model === 'inventoryItem') {
        const w = args?.where || {}
        // locationId must be honored, not just productId/variantId -- the purchase-order
        // receiving flow looks up the row for a specific receiving location, and matching the
        // wrong location's row here would credit stock to the wrong place.
        return mockInventoryItems.find((x) => x.productId === w.productId && (w.variantId === undefined || x.variantId === w.variantId) && (w.locationId === undefined || x.locationId === w.locationId)) || null
      }
      return null
    },
    upsert: async (args: any) => {
      if (model === 'setting' && args.where?.key) {
        const val = args.update?.value ?? args.create?.value ?? ''
        mockSettings.set(args.where.key, val)
        return { key: args.where.key, value: val }
      }
      if (model === 'collection' && args.where?.slug) {
        const existing = mockCollections.find((c: any) => c.slug === args.where.slug)
        if (existing) { Object.assign(existing, args.update || {}); return existing }
        const created = { id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, isActive: true, description: null, imageUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...(args.create || {}) }
        mockCollections.push(created)
        return created
      }
      if (model === 'deliveryTracking' && args.where?.orderId) {
        const existing = mockDeliveryTracking.find((x: any) => x.orderId === args.where.orderId)
        if (existing) { Object.assign(existing, args.update || {}, { updatedAt: new Date() }); return existing }
        // The route always supplies its own id/trackingToken in `create` -- respect those
        // rather than generating new ones, since the tracking token is what the customer-facing
        // /track/[token] URL is built from.
        const created = { active: false, latitude: null, longitude: null, etaMinutes: null, lastLocationUpdatedAt: null, createdAt: new Date(), updatedAt: new Date(), ...(args.create || {}) }
        mockDeliveryTracking.push(created)
        return created
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
      if (model === 'liveVisitorSession' && args.where?.sessionId) {
        const existing = mockLiveVisitorSessions.get(args.where.sessionId)
        const record = existing ? { ...existing, ...(args.update || {}) } : { id: `livevisitor-${Date.now()}`, ...(args.create || {}) }
        mockLiveVisitorSessions.set(args.where.sessionId, record)
        return record
      }
      if (model === 'abandonedCheckout' && args.where?.token) {
        const existing = mockAbandonedCheckouts.find((x) => x.token === args.where.token)
        if (existing) { Object.assign(existing, args.update || {}, { updatedAt: new Date() }); return existing }
        const created = { id: `abandoned-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, token: args.where.token, status: 'OPEN', lastActivity: new Date(), createdAt: new Date(), updatedAt: new Date(), ...(args.create || {}) }
        mockAbandonedCheckouts.push(created)
        return created
      }
      if (model === 'coinTransaction' && args.where?.id) {
        const existing = mockCoinTransactions.find((x) => x.id === args.where.id)
        if (existing) return existing
        const created = { id: args.where.id, createdAt: new Date(), ...(args.create || {}) }
        mockCoinTransactions.push(created)
        return created
      }
      if (model === 'customerSegmentMember' && args.where?.segmentId_customerId) {
        const { segmentId, customerId } = args.where.segmentId_customerId
        const existing = mockCustomerSegmentMembers.find((x) => x.segmentId === segmentId && x.customerId === customerId)
        if (existing) { Object.assign(existing, args.update || {}); return existing }
        const created = { id: `csm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, segmentId, customerId, createdAt: new Date(), addedAt: new Date(), ...(args.create || {}) }
        mockCustomerSegmentMembers.push(created)
        return created
      }
      if (model === 'giftCard' && args.where?.id) {
        const existing = mockGiftCards.find((x) => x.id === args.where.id)
        if (existing) return existing
        const created = { id: args.where.id, createdAt: new Date(), updatedAt: new Date(), status: 'ACTIVE', ...(args.create || {}) }
        created.balance ??= created.initialAmount ?? 0
        mockGiftCards.push(created)
        return created
      }
      if (model === 'customerTag' && args.where?.value) {
        const existing = mockCustomerTags.find((x) => x.value === args.where.value)
        if (existing) { Object.assign(existing, args.update || {}); return existing }
        const created = { id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, value: args.where.value, createdAt: new Date(), ...(args.create || {}) }
        mockCustomerTags.push(created)
        return created
      }
      if (model === 'customerTagMember' && args.where?.tagId_customerId) {
        const { tagId, customerId } = args.where.tagId_customerId
        const existing = mockCustomerTagMembers.find((x) => x.tagId === tagId && x.customerId === customerId)
        if (existing) { Object.assign(existing, args.update || {}); return existing }
        const created = { tagId, customerId, createdAt: new Date(), ...(args.create || {}) }
        mockCustomerTagMembers.push(created)
        return created
      }
      if (model === 'productPublication' && args.where?.productId_channelId) {
        const { productId, channelId } = args.where.productId_channelId
        const existing = mockProductPublications.find((x) => x.productId === productId && x.channelId === channelId)
        if (existing) { Object.assign(existing, args.update || {}); return { ...existing, channel: mockSalesChannels.find((c) => c.id === existing.channelId) || null } }
        const created = { id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, productId, channelId, available: true, publishedAt: new Date(), ...(args.create || {}) }
        mockProductPublications.push(created)
        return { ...created, channel: mockSalesChannels.find((c) => c.id === created.channelId) || null }
      }
      return args?.create || args?.update || {}
    },
    create: async (args: any) => {
      const item = { id: `${model}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), updatedAt: new Date(), ...(args?.data || {}) }
      if (model === 'order') {
        // Prisma's nested relation-write shorthand (`items: { create: [...] }`,
        // `paymentTransactions: { create: {...} }`) isn't a plain field value --
        // the generic spread above leaves it as a raw `{create: ...}` wrapper
        // instead of the array of rows every real Prisma client would return.
        // Any code iterating order.items/.events/.paymentTransactions as
        // arrays (this mock's own findMany included, since it returns these
        // same stored objects) would crash on that wrapper the moment a real
        // order existed -- expand it into real rows with their own ids here.
        const expandCreate = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: `${model}item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), ...row }))
        }
        item.items = expandCreate(item.items)
        item.events = expandCreate(item.events)
        item.paymentTransactions = expandCreate(item.paymentTransactions)
        mockOrders.unshift(item)
      }
      if (model === 'category') mockCategories.push(item)
      if (model === 'themeVersion') mockThemeVersions.unshift(item)
      if (model === 'storeLocation') { if (item.isDefault) for (const x of mockStoreLocations) x.isDefault = false; mockStoreLocations.push(item) }
      if (model === 'salesChannel') mockSalesChannels.push(item)
      if (model === 'webhookEndpoint') mockWebhookEndpoints.push(item)
      if (model === 'apiCredential') { if (item.status === undefined) item.status = 'ACTIVE'; mockApiCredentials.push(item) }
      if (model === 'taxRate') mockTaxRates.push(item)
      if (model === 'coupon') { item.usedCount ??= 0; mockCoupons.push(item) }
      if (model === 'fulfillment') mockFulfillments.unshift(item)
      if (model === 'fulfillmentLine') mockFulfillmentLines.push(item)
      if (model === 'walletTransaction') mockWalletTransactions.unshift(item)
      if (model === 'coinTransaction') mockCoinTransactions.unshift(item)
      if (model === 'giftCard') { item.balance ??= item.initialAmount ?? 0; mockGiftCards.push(item) }
      if (model === 'inventoryItem') { item.variantId ??= null; item.reserved ??= 0; item.lowStockThreshold ??= 5; mockInventoryItems.push(item) }
      if (model === 'productVariant') {
        // The product-duplication route's per-variant inventory write
        // (app/api/admin/products/[id]/duplicate/route.ts) arrives as a raw
        // `inventory: { create: {...} } }` wrapper, same nested relation-write shorthand
        // already expanded for 'product'/'order' above -- without expanding it here too, the
        // wrapper stayed an inert object on the variant and no row was ever pushed into
        // mockInventoryItems, leaving the duplicated variant with no inventory row at all
        // (rather than one present at quantity 0).
        if (item.inventory && typeof item.inventory === 'object') {
          const rows = Array.isArray(item.inventory) ? item.inventory : item.inventory.create ? (Array.isArray(item.inventory.create) ? item.inventory.create : [item.inventory.create]) : []
          const inventoryRows = rows.map((row: any) => ({ id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, variantId: item.id, reserved: 0, lowStockThreshold: 5, ...row }))
          item.inventory = inventoryRows
          for (const inv of inventoryRows) mockInventoryItems.push(inv)
        }
        mockProductVariants.push(item)
      }
      if (model === 'product') {
        // Same nested relation-write problem as 'order' above -- `images`/`inventory`/`tags`
        // arrive as raw {create: ...} wrappers from the admin create route's nested shorthand,
        // not plain arrays, and need their own generated ids. inventory (the product-level,
        // non-variant row) is pushed into mockInventoryItems -- the same array inventoryItem.create
        // already uses -- rather than embedded directly, so it's picked up by the dynamic
        // derivation every product read now uses (see deriveMockProductInventory above).
        const expandNested = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: `productchild-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), updatedAt: new Date(), ...row }))
        }
        item.images = expandNested(item.images)
        item.tags = expandNested(item.tags).map((row: any) => ({ ...row, productId: item.id }))
        const inventoryRows = expandNested(item.inventory).map((row: any) => ({ productId: item.id, variantId: null, reserved: 0, ...row }))
        item.inventory = inventoryRows
        item.variants = []
        item.category = item.categoryId ? mockCategories.find((c: any) => c.id === item.categoryId) || null : null
        mockProducts.push(item)
        for (const inv of inventoryRows) mockInventoryItems.push(inv)
      }
      if (model === 'user') { item.role ??= 'CUSTOMER'; item.isActive ??= true; mockUsers.push(item) }
      if (model === 'customerSegment') mockCustomerSegments.push(item)
      if (model === 'customerSegmentMember') mockCustomerSegmentMembers.push(item)
      if (model === 'homepageBlock') mockHomepageBlocks.push(item)
      if (model === 'wishlistItem') mockWishlistItems.push(item)
      if (model === 'review') { item.approved ??= false; item.featured ??= false; mockReviews.push(item) }
      if (model === 'productImage' && item.productId) {
        const product = mockProducts.find((p: any) => p.id === item.productId)
        if (product) { product.images = product.images || []; product.images.push(item) }
      }
      if (model === 'blog') mockBlogs.push(item)
      if (model === 'blogPost') { item.status ??= 'DRAFT'; item.tagsJson ??= null; mockBlogPosts.push(item) }
      if (model === 'page') { item.status ??= 'DRAFT'; item.template ??= 'page'; item.bodyHtml ??= null; item.seoTitle ??= null; item.seoDescription ??= null; item.publishedAt ??= null; mockPages.push(item) }
      if (model === 'redirect') { item.hits ??= 0; mockRedirects.push(item) }
      if (model === 'collection') { item.isActive ??= true; item.description ??= null; item.imageUrl ??= null; item.sortOrder ??= 0; mockCollections.push(item) }
      if (model === 'collectionProduct' && item.collectionId && item.productId) mockCollectionProducts.push(item)
      if (model === 'metafieldDefinition') { item.description ??= null; item.isList ??= false; mockMetafieldDefinitions.push(item) }
      if (model === 'mediaAsset') { item.alt ??= null; item.mimeType ??= null; item.width ??= null; item.height ??= null; item.sizeBytes ??= null; mockMediaAssets.push(item) }
      if (model === 'inventoryTransfer') {
        // Same nested relation-write problem as returnRequest/orderEdit above -- `items:
        // {create: [...]}}` arrives as a raw wrapper. InventoryTransferItem rows are embedded
        // directly on the parent row (every real caller only ever reaches them through their
        // parent transfer), matching returnRequest's own `items` convention.
        const expandItems = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: `transferitem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, inventoryId: null, variantId: null, received: 0, ...row }))
        }
        item.items = expandItems(item.items)
        item.notes ??= null
        item.shippedAt ??= null
        item.receivedAt ??= null
        mockInventoryTransfers.unshift(item)
      }
      if (model === 'passwordResetToken') mockPasswordResetTokens.push(item)
      if (model === 'orderEdit') {
        // Same nested relation-write problem as returnRequest/draftOrder above -- `items:
        // {create: [...]}}` arrives as a raw wrapper. OrderEditItem rows are embedded directly
        // on the parent row (same convention as returnItem), since every real caller only ever
        // reaches them through their parent order edit.
        const expandItems = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: genOrderChildId(), ...row }))
        }
        item.items = expandItems(item.items)
        item.committedAt ??= null
        mockOrderEdits.unshift(item)
      }
      if (model === 'orderItem' && item.orderId) {
        const order = mockOrders.find((o: any) => o.id === item.orderId)
        if (order) { order.items = order.items || []; order.items.push(item) }
      }
      if (model === 'orderEvent' && item.orderId) {
        const order = mockOrders.find((o: any) => o.id === item.orderId)
        if (order) { order.events = order.events || []; order.events.push(item) }
      }
      if (model === 'orderNote' && item.orderId) {
        const order = mockOrders.find((o: any) => o.id === item.orderId)
        if (order) { order.notesHistory = order.notesHistory || []; order.notesHistory.push(item) }
      }
      if (model === 'auditLog') mockAuditLogs.unshift(item)
      if (model === 'inventoryMovement') mockInventoryMovements.push(item)
      if (model === 'address') mockAddresses.push(item)
      if (model === 'returnRequest') {
        // Same nested relation-write problem as 'order'/'product' above -- `items: {create: [...]}}`
        // arrives as a raw wrapper, not an array, and each ReturnItem needs its own generated id.
        // ReturnItem rows are embedded directly on the parent row (rather than a separate
        // mockReturnItems array) since every real caller only ever reaches them through their
        // parent returnRequest -- matching product.images' embedded-relation convention.
        const expandItems = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: `returnitem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, condition: null, ...row }))
        }
        item.items = expandItems(item.items)
        item.notes ??= null
        item.refundAmount ??= 0
        item.restock ??= true
        item.receivedAt ??= null
        item.refundedAt ??= null
        mockReturnRequests.unshift(item)
      }
      if (model === 'notification') { item.readAt ??= null; mockNotifications.unshift(item) }
      if (model === 'shippingZone') {
        // Same nested relation-write problem as 'order'/'product'/'returnRequest'/'draftOrder'
        // above -- `rates: {create: {...}}}` (a single object here, not an array) arrives as a
        // raw wrapper and needs its own generated id, with zoneId set for shippingRate.update's
        // cross-zone lookup below.
        const expandRates = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: `rate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, zoneId: item.id, isActive: true, ...row }))
        }
        item.regions ??= null
        item.isActive ??= true
        item.rates = expandRates(item.rates)
        mockShippingZones.push(item)
      }
      if (model === 'draftOrder') {
        // Same nested relation-write problem as 'order'/'product'/'returnRequest' above --
        // `items: {create: [...]}}` arrives as a raw wrapper, not an array. Without expanding
        // it here, the POST response's `draft.items` comes back as that raw object instead of
        // an array, which throws the moment the admin UI tries to `.map()`/render it -- an
        // actual crash, not just silent data loss.
        const expandItems = (value: any) => {
          if (!value || typeof value !== 'object') return []
          const rows = Array.isArray(value) ? value : value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : []
          return rows.map((row: any) => ({ id: `draftitem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...row }))
        }
        item.items = expandItems(item.items)
        item.status ??= 'DRAFT'
        item.invoiceSentAt ??= null
        item.completedOrderId ??= null
        mockDraftOrders.unshift(item)
      }
      if (model === 'purchaseOrder') {
        // Same nested relation-write problem as draftOrder/returnRequest above -- `items:
        // {create: [...]}}` arrives as a raw wrapper -- but unlike those, items go into the
        // separate mockPurchaseOrderItems array (see the comment on that array's declaration)
        // rather than embedded on this row, so `item.items` is deleted rather than kept.
        const rawItems = item.items
        delete item.items
        item.status ??= 'DRAFT'
        item.locationId ??= null
        item.supplierName ??= null
        item.notes ??= null
        item.orderedAt ??= null
        item.receivedAt ??= null
        mockPurchaseOrders.push(item)
        const rows = Array.isArray(rawItems) ? rawItems : rawItems?.create ? (Array.isArray(rawItems.create) ? rawItems.create : [rawItems.create]) : []
        for (const row of rows) mockPurchaseOrderItems.push({ id: `poitem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, purchaseOrderId: item.id, quantityReceived: 0, ...row })
        // Return a separate object carrying the requested includes -- `item` itself (the row
        // stored in mockPurchaseOrders above) stays free of an `items`/`location` snapshot that
        // would go stale the moment an item is received or the PO's location changes.
        const result: any = { ...item }
        if (args?.include?.items) result.items = derivePurchaseOrderItems(item.id)
        if (args?.include?.location) result.location = item.locationId ? mockStoreLocations.find((l: any) => l.id === item.locationId) || null : null
        return result
      }
      if (model === 'paymentTransaction' && item.orderId) {
        const order = mockOrders.find((o) => o.id === item.orderId)
        if (order) { order.paymentTransactions ??= []; order.paymentTransactions.push(item) }
      }
      if (model === 'orderNote' && args?.include?.user) return { ...item, user: mockUsers.find((u: any) => u.id === item.userId) || null }
      return item
    },
    update: async (args: any) => {
      if (model === 'paymentTransaction' && args.where?.id) {
        const found = findMockPaymentTransaction({ id: args.where.id })
        if (!found) throw new Error('Record to update not found')
        Object.assign(found.transaction, args.data || {})
        return found.transaction
      }
      if (model === 'user' && args.where?.id) {
        const u = mockUsers.find((x) => x.id === args.where.id)
        if (u) Object.assign(u, args.data || {})
        return u || args.data
      }
      // productImage rows are embedded on their parent product's `.images` array rather than
      // their own top-level mock array (matching mockProducts' existing seed-data shape), so a
      // singular update (no productId in `where`, just the image's own id) has to search across
      // every product for it -- same idea as findMockPaymentTransaction above.
      if (model === 'productImage' && args.where?.id) {
        for (const p of mockProducts) {
          const img = (p.images || []).find((x: any) => x.id === args.where.id)
          if (img) { Object.assign(img, args.data || {}); return img }
        }
        throw new Error('Record to update not found')
      }
      // returnItem rows are embedded on their parent returnRequest's `.items` array (same
      // convention as productImage above), so the 'receive' admin action's per-item condition
      // update (id alone, no returnRequestId in `where`) has to search across every return.
      if (model === 'returnItem' && args.where?.id) {
        for (const r of mockReturnRequests) {
          const it = (r.items || []).find((x: any) => x.id === args.where.id)
          if (it) { Object.assign(it, args.data || {}); return it }
        }
        throw new Error('Record to update not found')
      }
      // shippingRate rows are embedded on their parent zone's `.rates` array (same convention
      // as productImage/returnItem above), so a singular update (no zoneId in `where`, just the
      // rate's own id) has to search across every zone for it.
      if (model === 'shippingRate' && args.where?.id) {
        for (const z of mockShippingZones) {
          const r = (z.rates || []).find((x: any) => x.id === args.where.id)
          if (r) { Object.assign(r, args.data || {}); return r }
        }
        throw new Error('Record to update not found')
      }
      // order.items/.events rows are embedded on their parent order (same convention as
      // shippingRate/returnItem above), so a singular update (no orderId in `where`, just the
      // item's own id) has to search across every order for it -- used by the order-edit commit
      // flow's tx.orderItem.update calls.
      if (model === 'orderItem' && args.where?.id) {
        for (const o of mockOrders) {
          const it = (o.items || []).find((x: any) => x.id === args.where.id)
          if (it) { Object.assign(it, args.data || {}); return it }
        }
        throw new Error('Record to update not found')
      }
      // inventoryTransferItem rows are embedded on their parent transfer's `.items` array (same
      // convention as orderItem/returnItem above) -- the receive-transfer flow's per-item
      // `received` update (id alone, no transferId in `where`) has to search across every transfer.
      if (model === 'inventoryTransferItem' && args.where?.id) {
        for (const t of mockInventoryTransfers) {
          const it = (t.items || []).find((x: any) => x.id === args.where.id)
          if (it) { Object.assign(it, args.data || {}); return it }
        }
        throw new Error('Record to update not found')
      }
      // The categories CSV import's second pass (app/api/admin/imports/route.ts) wires up
      // parent/child hierarchy via tx.category.update({ where: { slug }, data: { parentId } })
      // once every row exists -- the generic byId dispatch below only ever matches args.where.id,
      // so a where.slug update silently fell through to the no-op `return args?.data || {}`
      // fallback, reporting success while never actually setting parentId.
      if (model === 'category' && args.where?.slug && !args.where?.id) {
        const row: any = mockCategories.find((c: any) => c.slug === args.where.slug)
        if (!row) throw new Error('Record to update not found')
        Object.assign(row, args.data || {})
        row.updatedAt = new Date()
        return row
      }
      const byId: Record<string, any[]> = { storeLocation: mockStoreLocations, salesChannel: mockSalesChannels, webhookEndpoint: mockWebhookEndpoints, apiCredential: mockApiCredentials, taxRate: mockTaxRates, coupon: mockCoupons, fulfillment: mockFulfillments, giftCard: mockGiftCards, productVariant: mockProductVariants, inventoryItem: mockInventoryItems, homepageBlock: mockHomepageBlocks, review: mockReviews, blogPost: mockBlogPosts, product: mockProducts, order: mockOrders, address: mockAddresses, returnRequest: mockReturnRequests, notification: mockNotifications, draftOrder: mockDraftOrders, shippingZone: mockShippingZones, purchaseOrder: mockPurchaseOrders, purchaseOrderItem: mockPurchaseOrderItems, page: mockPages, redirect: mockRedirects, collection: mockCollections, orderEdit: mockOrderEdits, inventoryTransfer: mockInventoryTransfers, category: mockCategories }
      if (byId[model] && args.where?.id) {
        const row = byId[model].find((x) => x.id === args.where.id)
        if (!row) throw new Error('Record to update not found')
        if (model === 'storeLocation' && args.data?.isDefault === true) for (const x of mockStoreLocations) x.isDefault = false
        for (const [key, value] of Object.entries(args.data || {})) {
          // order.update is called throughout checkout/refunds/returns/cancellation/webhooks
          // with a nested `events: { create: {...} } }` alongside plain status fields, to log
          // what just happened -- same nested-write shorthand as order.create's own `events`,
          // except here it must APPEND to the order's existing event history, not replace it
          // (a plain `row[key] = value` would overwrite that array with the raw {create} wrapper).
          if (model === 'order' && key === 'events' && value && typeof value === 'object') {
            const rows = Array.isArray(value) ? value : (value as any).create ? (Array.isArray((value as any).create) ? (value as any).create : [(value as any).create]) : []
            const expanded = rows.map((r: any) => ({ id: `orderitem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), ...r }))
            row.events = [...(row.events || []), ...expanded]
          } else if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) {
            const delta = (value as any).increment ?? -(value as any).decrement
            row[key] = (row[key] || 0) + delta
          } else {
            row[key] = value
          }
        }
        row.updatedAt = new Date()
        // Keep the embedded `category` object (findMany/findUnique don't do a live join for it)
        // in sync whenever categoryId actually changes, the same way `create` embeds it.
        if (model === 'product' && 'categoryId' in (args.data || {})) row.category = row.categoryId ? mockCategories.find((c: any) => c.id === row.categoryId) || null : null
        if (model === 'fulfillment' && args?.include?.lines) return { ...row, lines: mockFulfillmentLines.filter((l) => l.fulfillmentId === row.id) }
        if (model === 'purchaseOrder' && (args?.include?.items || args?.include?.location)) {
          const result: any = { ...row }
          if (args.include.items) result.items = derivePurchaseOrderItems(row.id)
          if (args.include.location) result.location = row.locationId ? mockStoreLocations.find((l: any) => l.id === row.locationId) || null : null
          return result
        }
        return row
      }
      return args?.data || {}
    },
    delete: async (args?: any) => {
      if (model === 'customerTagMember' && args?.where?.tagId_customerId) {
        const { tagId, customerId } = args.where.tagId_customerId
        const i = mockCustomerTagMembers.findIndex((x) => x.tagId === tagId && x.customerId === customerId)
        if (i >= 0) return mockCustomerTagMembers.splice(i, 1)[0]
        return {}
      }
      if (model === 'customerSegmentMember' && args?.where?.segmentId_customerId) {
        const { segmentId, customerId } = args.where.segmentId_customerId
        const i = mockCustomerSegmentMembers.findIndex((x) => x.segmentId === segmentId && x.customerId === customerId)
        if (i >= 0) return mockCustomerSegmentMembers.splice(i, 1)[0]
        return {}
      }
      if (model === 'productPublication' && args?.where?.productId_channelId) {
        const { productId, channelId } = args.where.productId_channelId
        const i = mockProductPublications.findIndex((x) => x.productId === productId && x.channelId === channelId)
        if (i >= 0) return mockProductPublications.splice(i, 1)[0]
        return {}
      }
      // Had a deleteMany branch (keyed by args.where.key) but no branch for singular delete at
      // all, which this mock's `id` convention (`set-${key}`, see setting.findUnique above) makes
      // easy to add -- without it, the theme-publish route's `setting.delete({where:{key:
      // 'theme.draft'}})` calls silently no-op, so the editor's "unpublished changes" flag never
      // clears after a real publish, and lib/push.ts's dead-subscription cleanup
      // (`delete({where:{id:saved.settingId}})`) never actually prunes a rejected endpoint.
      if (model === 'setting' && args?.where?.key) {
        const value = mockSettings.get(args.where.key)
        if (value === undefined) return {}
        mockSettings.delete(args.where.key)
        return { id: `set-${args.where.key}`, key: args.where.key, value }
      }
      if (model === 'setting' && args?.where?.id) {
        for (const key of mockSettings.keys()) {
          if (`set-${key}` === args.where.id) {
            const value = mockSettings.get(key)!
            mockSettings.delete(key)
            return { id: args.where.id, key, value }
          }
        }
        return {}
      }
      // The product editor's variant-removal and shared-pool-conversion flows both call this by id
      // (app/api/admin/products/[id]/route.ts) -- without a real branch, the row was never removed
      // from mockInventoryItems, leaving orphaned/duplicate stock rows that inflate the unfiltered
      // low-stock dashboard tile and the admin inventory list.
      const byId: Record<string, any[]> = { storeLocation: mockStoreLocations, salesChannel: mockSalesChannels, webhookEndpoint: mockWebhookEndpoints, apiCredential: mockApiCredentials, taxRate: mockTaxRates, user: mockUsers, homepageBlock: mockHomepageBlocks, wishlistItem: mockWishlistItems, blogPost: mockBlogPosts, product: mockProducts, productVariant: mockProductVariants, address: mockAddresses, shippingZone: mockShippingZones, page: mockPages, redirect: mockRedirects, collection: mockCollections, metafieldDefinition: mockMetafieldDefinitions, category: mockCategories, inventoryItem: mockInventoryItems }
      const list = byId[model]
      if (list && args?.where?.id) { const i = list.findIndex((x) => x.id === args.where.id); if (i >= 0) return list.splice(i, 1)[0] }
      return {}
    },
    count: async (args?: any) => {
      // The admin products list's pagination total and the platform-health dashboard's
      // "active products missing a publish date" metric both rely on this being real --
      // without where filtering, count() always returned the full unfiltered catalog size,
      // so a filtered list of 3 results still reported pages worth of the full 500-product
      // table, and the health metric never matched the actual repairable set.
      if (model === 'product') {
        const w = args?.where || {}
        let list = mockProducts
        if (w.status) list = list.filter((p: any) => p.status === w.status)
        if (w.featured !== undefined) list = list.filter((p: any) => p.featured === w.featured)
        if (w.categoryId !== undefined) list = list.filter((p: any) => p.categoryId === w.categoryId)
        if (w.category?.slug) list = list.filter((p: any) => p.category?.slug === w.category.slug)
        if (w.publishedAt === null) list = list.filter((p: any) => p.publishedAt == null)
        if (w.giftCard !== undefined) list = list.filter((p: any) => Boolean(p.giftCard) === w.giftCard)
        if (Array.isArray(w.OR)) list = list.filter((p: any) => w.OR.some((cond: any) => Object.entries(cond).some(([field, sub]) => mockFieldContains(p[field], sub))))
        return list.length
      }
      // Real callers span the admin orders list (status + search OR), the admin dashboard
      // ("orders today", "pending orders"), and account pages ("my orders" count, all scoped
      // to where.userId) -- without where filtering here, every one of these always got back
      // the full unfiltered order count regardless of what was actually asked for (a customer's
      // "my orders" count showed the whole store's order total, admin's filtered order list
      // showed a pagination total for the unfiltered set, etc).
      if (model === 'order') {
        const w = args?.where || {}
        let list = mockOrders
        if (w.userId) list = list.filter((o: any) => o.userId === w.userId)
        if (w.createdAt?.gte) list = list.filter((o: any) => new Date(o.createdAt) >= new Date(w.createdAt.gte))
        if (w.createdAt?.lt) list = list.filter((o: any) => new Date(o.createdAt) < new Date(w.createdAt.lt))
        if (w.status?.notIn) { const statuses = new Set(w.status.notIn); list = list.filter((o: any) => !statuses.has(o.status)) }
        else if (w.status?.in) { const statuses = new Set(w.status.in); list = list.filter((o: any) => statuses.has(o.status)) }
        else if (typeof w.status === 'string') list = list.filter((o: any) => o.status === w.status)
        if (Array.isArray(w.OR)) {
          list = list.filter((o: any) => w.OR.some((cond: any) => {
            if (cond.user?.is?.name) {
              const user = mockUsers.find((u: any) => u.id === o.userId)
              return mockFieldContains(user?.name, cond.user.is.name)
            }
            return Object.entries(cond).some(([field, sub]) => mockFieldContains(o[field], sub))
          }))
        }
        return list.length
      }
      if (model === 'auditLog') return filterMockAuditLogs(args?.where).length
      // The admin location-delete route's referential-integrity guard checks this too -- without
      // it, a location with open fulfillments reported zero references and the delete silently
      // proceeded, orphaning those fulfillments' locationId.
      if (model === 'fulfillment') { const w = args?.where || {}; return w.locationId !== undefined ? mockFulfillments.filter((x: any) => x.locationId === w.locationId).length : mockFulfillments.length }
      if (model === 'page') return mockPages.length
      if (model === 'address') return mockAddresses.filter((x: any) => x.userId === args?.where?.userId).length
      if (model === 'notification') {
        const w = args?.where || {}
        return mockNotifications.filter((x: any) => x.userId === w.userId && (w.readAt !== null || x.readAt === null)).length
      }
      if (model === 'draftOrder') {
        const w = args?.where || {}
        if (w.status?.in) { const statuses = new Set(w.status.in); return mockDraftOrders.filter((x: any) => statuses.has(x.status)).length }
        return mockDraftOrders.length
      }
      // The admin location-delete route's referential-integrity guard -- without this, deleting
      // a StoreLocation that still has active inbound/outbound transfers always silently
      // reported zero, letting the delete proceed despite in-flight transfers referencing it.
      if (model === 'inventoryTransfer') {
        const w = args?.where || {}
        if (Array.isArray(w.OR)) return mockInventoryTransfers.filter((t: any) => w.OR.some((cond: any) => (cond.fromLocationId !== undefined && t.fromLocationId === cond.fromLocationId) || (cond.toLocationId !== undefined && t.toLocationId === cond.toLocationId))).length
        return mockInventoryTransfers.length
      }
      if (model === 'purchaseOrder') {
        let list = mockPurchaseOrders
        const w = args?.where || {}
        if (w.status?.in) { const statuses = new Set(w.status.in); list = list.filter((x: any) => statuses.has(x.status)) }
        // The admin location-delete route's referential-integrity guard checks this too --
        // without it, a location with open purchase orders reported zero references and the
        // delete silently proceeded, orphaning those purchase orders' locationId.
        if (w.locationId !== undefined) list = list.filter((x: any) => x.locationId === w.locationId)
        return list.length
      }
      if (model === 'shippingZone') {
        const w = args?.where || {}
        let list = mockShippingZones
        if (w.isActive !== undefined) list = list.filter((x: any) => x.isActive === w.isActive)
        if (w.rates?.none?.isActive !== undefined) list = list.filter((x: any) => !(x.rates || []).some((r: any) => r.isActive === w.rates.none.isActive))
        return list.length
      }
      if (model === 'shippingRate') {
        const w = args?.where || {}
        let rates = mockShippingZones.flatMap((z: any) => z.rates || [])
        if (w.isActive !== undefined) rates = rates.filter((r: any) => r.isActive === w.isActive)
        return rates.length
      }
      // Used by fulfillOrderStock to tell a dedicated-variant inventory row apart from the
      // shared product-level pool.
      if (model === 'inventoryItem') {
        let list = mockInventoryItems
        const w = args?.where || {}
        if (w.productId) list = list.filter((x: any) => x.productId === w.productId)
        if (w.variantId !== undefined) list = list.filter((x: any) => x.variantId === w.variantId)
        // The admin location-delete route's referential-integrity guard checks this too --
        // without it, a location with real stock rows reported zero references and the delete
        // silently proceeded, orphaning those inventory items' locationId.
        if (w.locationId !== undefined) list = list.filter((x: any) => x.locationId === w.locationId)
        return list.length
      }
      if (model === 'customerTagMember') {
        let list = mockCustomerTagMembers
        if (args?.where?.tagId) list = list.filter((x) => x.tagId === args.where.tagId)
        return list.length
      }
      if (model === 'abandonedCheckout') {
        let list = mockAbandonedCheckouts
        if (args?.where?.status) list = list.filter((x) => x.status === args.where.status)
        return list.length
      }
      if (model === 'user') {
        let list = mockUsers
        // lib/platform-health.ts's "Staff access" critical check counts role: { not: 'CUSTOMER' }
        // -- without this, it always fell through to the plain-equality branch below (which never
        // matches an object), returning 0 and falsely reporting no staff account exists.
        if (args?.where?.role?.not !== undefined) list = list.filter((u) => u.role !== args.where.role.not)
        else if (args?.where?.role !== undefined) list = list.filter((u) => u.role === args.where.role)
        if (args?.where?.isActive !== undefined) list = list.filter((u) => u.isActive === args.where.isActive)
        if (args?.where?.id?.in) { const ids = new Set(args.where.id.in); list = list.filter((u) => ids.has(u.id)) }
        // The admin Reports page's "new customers" KPI counts role: 'CUSTOMER' scoped to
        // createdAt.gte(since) -- without this, the date window was silently dropped and the
        // stat always equalled the store's total customer count regardless of the selected range.
        if (args?.where?.createdAt?.gte) list = list.filter((u) => new Date(u.createdAt) >= new Date(args.where.createdAt.gte))
        if (args?.where?.createdAt?.lt) list = list.filter((u) => new Date(u.createdAt) < new Date(args.where.createdAt.lt))
        return list.length
      }
      // The admin Platform Health dashboard's stat tiles all lean on these being real -- without
      // them, roughly a third of the tiles (active gift cards, active coupons, webhook
      // endpoints, API credentials, sales channels, open order edits, blog posts, media assets,
      // store locations) fell to the generic `return 0` fallback below and showed 0 regardless
      // of actual data.
      if (model === 'coupon') {
        let list = mockCoupons
        if (args?.where?.isActive !== undefined) list = list.filter((x: any) => x.isActive === args.where.isActive)
        return list.length
      }
      if (model === 'giftCard') {
        let list = mockGiftCards
        if (args?.where?.status !== undefined) list = list.filter((x: any) => x.status === args.where.status)
        return list.length
      }
      if (model === 'storeLocation') {
        let list = mockStoreLocations
        if (args?.where?.status !== undefined) list = list.filter((x: any) => x.status === args.where.status)
        return list.length
      }
      if (model === 'webhookEndpoint') {
        let list = mockWebhookEndpoints
        if (args?.where?.status !== undefined) list = list.filter((x: any) => x.status === args.where.status)
        return list.length
      }
      if (model === 'apiCredential') {
        let list = mockApiCredentials
        if (args?.where?.status !== undefined) list = list.filter((x: any) => x.status === args.where.status)
        return list.length
      }
      if (model === 'salesChannel') {
        let list = mockSalesChannels
        if (args?.where?.status !== undefined) list = list.filter((x: any) => x.status === args.where.status)
        return list.length
      }
      if (model === 'orderEdit') {
        let list = mockOrderEdits
        if (args?.where?.status !== undefined) list = list.filter((x: any) => x.status === args.where.status)
        return list.length
      }
      if (model === 'blogPost') return mockBlogPosts.length
      if (model === 'mediaAsset') return mockMediaAssets.length
      // The admin dashboard's "pending reviews" stat tile relies on this -- without where
      // filtering it fell to the generic return 0 below and always showed 0 regardless of how
      // many reviews were actually awaiting moderation.
      if (model === 'review') {
        let list = mockReviews
        if (args?.where?.approved !== undefined) list = list.filter((x: any) => x.approved === args.where.approved)
        return list.length
      }
      // lib/platform-health.ts's variant-count tile calls this bare (no where) -- it fell to the
      // generic return 0 below and always showed 0 regardless of how many variants existed.
      if (model === 'productVariant') return mockProductVariants.length
      if (model === 'setting') {
        const w = args?.where || {}
        if (w.key?.in) { const keys = new Set(w.key.in); return Array.from(mockSettings.keys()).filter((k) => keys.has(k)).length }
        if (typeof w.key === 'string') return mockSettings.has(w.key) ? 1 : 0
        return mockSettings.size
      }
      return 0
    },
    createMany: async (args: any) => {
      const rows: any[] = args?.data || []
      if (model === 'productTag') {
        for (const row of rows) {
          const product = mockProducts.find((p: any) => p.id === row.productId) as any
          if (product) { product.tags = product.tags || []; product.tags.push({ id: `productchild-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), updatedAt: new Date(), ...row }) }
        }
      }
      if (model === 'shippingRate') {
        for (const row of rows) {
          const zone = mockShippingZones.find((z: any) => z.id === row.zoneId)
          if (zone) { zone.rates = zone.rates || []; zone.rates.push({ id: `rate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, isActive: true, ...row }) }
        }
      }
      if (model === 'collectionProduct') {
        for (const row of rows) mockCollectionProducts.push({ id: `colprod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...row })
      }
      if (model === 'metafieldValue') {
        for (const row of rows) mockMetafieldValues.push({ id: `metafieldvalue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...row })
      }
      return { count: rows.length }
    },
    updateMany: async (args?: any) => {
      // lib/inventory.ts's whole reservation/release/fulfillment ledger leans on this being a
      // real optimistic-concurrency guard: e.g. reserveStock's
      // `where: { id, reserved: { lte: quantity - canReserve } }` must return count 0 (not the
      // generic fallback's unconditional count: 1) when another reservation already ate the
      // headroom, or reserved would silently over-commit past actual quantity.
      if (model === 'inventoryItem') {
        const w = args?.where || {}
        let targets = mockInventoryItems
        if (typeof w.id === 'string') targets = targets.filter((x: any) => x.id === w.id)
        if (w.id?.in) { const ids = new Set(w.id.in); targets = targets.filter((x: any) => ids.has(x.id)) }
        if (w.reserved?.lte !== undefined) targets = targets.filter((x: any) => x.reserved <= w.reserved.lte)
        if (w.reserved?.gte !== undefined) targets = targets.filter((x: any) => x.reserved >= w.reserved.gte)
        if (w.quantity?.gte !== undefined) targets = targets.filter((x: any) => x.quantity >= w.quantity.gte)
        for (const target of targets) {
          for (const [key, value] of Object.entries(args?.data || {})) {
            if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) {
              const delta = (value as any).increment ?? -(value as any).decrement
              target[key] = (target[key] || 0) + delta
            } else {
              target[key] = value
            }
          }
          target.updatedAt = new Date()
        }
        return { count: targets.length }
      }
      if (model === 'abandonedCheckout') {
        let targets = mockAbandonedCheckouts
        if (args?.where?.token) targets = targets.filter((x) => x.token === args.where.token)
        if (args?.where?.status) targets = targets.filter((x) => x.status === args.where.status)
        for (const target of targets) Object.assign(target, args?.data || {}, { updatedAt: new Date() })
        return { count: targets.length }
      }
      // Checkout's gift-card redemption leans on this being a real optimistic-concurrency guard
      // the same way inventoryItem's above already is: `where: { id, status: 'ACTIVE',
      // balance: { gte: amount } }` must return count 0 (not the generic fallback's unconditional
      // count: 1) once the balance can't cover the redemption, or the same gift card could be
      // spent for its full value an unlimited number of times without ever actually decrementing.
      // expireGiftCards (lib/gift-cards.ts) also depends on this to actually flip stale cards to
      // EXPIRED rather than leaving them ACTIVE forever.
      if (model === 'giftCard') {
        const w = args?.where || {}
        let targets = mockGiftCards
        if (typeof w.id === 'string') targets = targets.filter((x: any) => x.id === w.id)
        if (w.status) targets = targets.filter((x: any) => x.status === w.status)
        if (w.balance?.gte !== undefined) targets = targets.filter((x: any) => x.balance >= w.balance.gte)
        if (w.expiresAt?.lt !== undefined) targets = targets.filter((x: any) => x.expiresAt && new Date(x.expiresAt) < new Date(w.expiresAt.lt))
        for (const target of targets) {
          for (const [key, value] of Object.entries(args?.data || {})) {
            if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) {
              const delta = (value as any).increment ?? -(value as any).decrement
              target[key] = (target[key] || 0) + delta
            } else {
              target[key] = value
            }
          }
          target.updatedAt = new Date()
        }
        return { count: targets.length }
      }
      // Powers the notification bell's "mark all read" action.
      if (model === 'notification') {
        const w = args?.where || {}
        let targets = mockNotifications.filter((x: any) => x.userId === w.userId)
        if (w.readAt === null) targets = targets.filter((x: any) => x.readAt === null)
        for (const target of targets) Object.assign(target, args?.data || {})
        return { count: targets.length }
      }
      // Clears isDefault on a user's other addresses when a new/edited one becomes the default.
      if (model === 'address') {
        const w = args?.where || {}
        let targets = mockAddresses.filter((x: any) => x.userId === w.userId)
        if (w.NOT?.id) targets = targets.filter((x: any) => x.id !== w.NOT.id)
        for (const target of targets) Object.assign(target, args?.data || {}, { updatedAt: new Date() })
        return { count: targets.length }
      }
      if (model === 'storeLocation') {
        const excludeId = args?.where?.id?.not
        let count = 0
        for (const x of mockStoreLocations) { if (excludeId && x.id === excludeId) continue; Object.assign(x, args?.data || {}); count++ }
        return { count }
      }
      // The admin returns POST (direct create) and PATCH 'receive' actions both lean on this
      // being a real optimistic-concurrency guard -- `where: { id, updatedAt: order.updatedAt }`
      // must return count 0 (not the generic fallback's unconditional count: 1) when the order
      // changed since it was read, or both branch on `guarded.count !== 1` to throw
      // RETURN_CONFLICT_MESSAGE, a check that can never trip against the generic fallback.
      if (model === 'order') {
        const w = args?.where || {}
        let targets = mockOrders
        if (w.id) targets = targets.filter((x: any) => x.id === w.id)
        if (w.updatedAt) targets = targets.filter((x: any) => x.updatedAt.getTime() === new Date(w.updatedAt).getTime())
        // deleteCustomerCascade (lib/customers.ts) calls this with only `where: { userId }` to
        // null out the FK before deleting the user -- without this filter, targets stayed
        // unfiltered (neither w.id nor w.updatedAt is set) and every order in the store, not just
        // this customer's, had its userId wiped.
        if (w.userId !== undefined) targets = targets.filter((x: any) => x.userId === w.userId)
        for (const target of targets) Object.assign(target, args?.data || {}, { updatedAt: new Date() })
        return { count: targets.length }
      }
      // completeDraftOrder (lib/draft-orders.ts) leans on this being a real optimistic-concurrency
      // guard the same way order's updateMany above already is -- `where: { id, status: { in: [...] } }`
      // must return count 0 (not the generic fallback's unconditional count: 1) once a concurrent
      // completion has already flipped the draft to COMPLETED, or two requests could both pass and
      // each create a full real Order (double-reserving stock and double-charging) from one draft.
      if (model === 'draftOrder') {
        const w = args?.where || {}
        let targets = mockDraftOrders
        if (w.id) targets = targets.filter((x: any) => x.id === w.id)
        if (w.status?.in) { const statuses = new Set(w.status.in); targets = targets.filter((x: any) => statuses.has(x.status)) }
        else if (typeof w.status === 'string') targets = targets.filter((x: any) => x.status === w.status)
        for (const target of targets) Object.assign(target, args?.data || {}, { updatedAt: new Date() })
        return { count: targets.length }
      }
      // deleteCustomerCascade (lib/customers.ts) calls this with `where: { actorId }` to null out
      // the FK before deleting the actor's user row -- without a real branch this fell to the
      // generic fallback below (an unconditional count: 1 with no mutation applied), leaving audit
      // log rows pointing at a since-deleted user id.
      if (model === 'auditLog') {
        const w = args?.where || {}
        let targets = mockAuditLogs
        if (w.actorId !== undefined) targets = targets.filter((x: any) => x.actorId === w.actorId)
        for (const target of targets) Object.assign(target, args?.data || {})
        return { count: targets.length }
      }
      // Backs three real call sites: the admin products list's bulk toolbar (Activate/Draft/
      // Archive/Feature, `where: { id: { in: ids } } }`), the "Repair Platform State" action
      // (`where: { status: 'ACTIVE', publishedAt: null } }`), and category delete's cascade
      // clear (`where: { categoryId } }`). Without a real branch this fell to the generic
      // fallback below (an unconditional count: 1 with no mutation applied) -- bulk actions
      // silently changed nothing and always reported count: 1 regardless of selection size.
      if (model === 'product') {
        const w = args?.where || {}
        let targets: any[] = mockProducts
        if (w.id?.in) { const ids = new Set(w.id.in); targets = targets.filter((x: any) => ids.has(x.id)) }
        if (typeof w.id === 'string') targets = targets.filter((x: any) => x.id === w.id)
        if (w.status !== undefined) targets = targets.filter((x: any) => x.status === w.status)
        if (w.publishedAt === null) targets = targets.filter((x: any) => x.publishedAt == null)
        if (w.categoryId !== undefined) targets = targets.filter((x: any) => x.categoryId === w.categoryId)
        for (const target of targets) {
          for (const [key, value] of Object.entries(args?.data || {})) {
            if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) {
              const delta = (value as any).increment ?? -(value as any).decrement
              target[key] = (target[key] || 0) + delta
            } else {
              target[key] = value
            }
          }
          target.updatedAt = new Date()
          if ('categoryId' in (args?.data || {})) target.category = target.categoryId ? mockCategories.find((c: any) => c.id === target.categoryId) || null : null
        }
        return { count: targets.length }
      }
      // Category delete's cascade clear calls this with `where: { parentId: id }, data: {
      // parentId: null } }` to orphan-safe any child categories before removing their parent --
      // without a real branch this fell to the generic fallback (count: 1, no mutation applied),
      // leaving child categories pointing at a since-deleted parentId.
      if (model === 'category') {
        const w = args?.where || {}
        let targets: any[] = mockCategories
        if (w.parentId !== undefined) targets = targets.filter((x: any) => x.parentId === w.parentId)
        for (const target of targets) Object.assign(target, args?.data || {})
        return { count: targets.length }
      }
      const byModel: Record<string, any[]> = { user: mockUsers, collection: mockCollections, coupon: mockCoupons }
      const list = byModel[model]
      if (list) {
        let targets = list
        if (args?.where?.id?.in) { const ids = new Set(args.where.id.in); targets = targets.filter((x) => ids.has(x.id)) }
        if (args?.where?.id !== undefined && typeof args.where.id === 'string') targets = targets.filter((x) => x.id === args.where.id)
        if (args?.where?.role !== undefined) targets = targets.filter((x) => x.role === args.where.role)
        if (args?.where?.isActive !== undefined) targets = targets.filter((x) => x.isActive === args.where.isActive)
        if (args?.where?.code !== undefined) targets = targets.filter((x) => x.code === args.where.code)
        if (args?.where?.usedCount?.lt !== undefined) targets = targets.filter((x) => (x.usedCount || 0) < args.where.usedCount.lt)
        if (args?.where?.usedCount?.gt !== undefined) targets = targets.filter((x) => (x.usedCount || 0) > args.where.usedCount.gt)
        // The admin "repair platform state" action's `where: { isActive: true, expiresAt: {
        // lt: now } }` leans on this being real -- without it, that expiresAt condition was
        // silently dropped and the action matched (and deactivated) every active coupon in the
        // store, not just the expired ones.
        if (args?.where?.expiresAt?.lt !== undefined) targets = targets.filter((x) => x.expiresAt && new Date(x.expiresAt).getTime() < new Date(args.where.expiresAt.lt).getTime())
        for (const target of targets) {
          for (const [key, value] of Object.entries(args?.data || {})) {
            if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) {
              const delta = (value as any).increment ?? -(value as any).decrement
              target[key] = (target[key] || 0) + delta
            } else {
              target[key] = value
            }
          }
        }
        return { count: targets.length }
      }
      return { count: 1 }
    },
    // Generic aggregation fallbacks -- an empty group list / all-zero
    // aggregate is always a safe shape for callers that only ever consume
    // real data when a database is actually connected (dashboards, reports).
    groupBy: async (args?: any) => {
      if (model === 'customerSegmentMember' && args?.by?.includes('segmentId')) {
        let list = [...mockCustomerSegmentMembers]
        if (args?.where?.segmentId?.in) { const ids = new Set(args.where.segmentId.in); list = list.filter((x) => ids.has(x.segmentId)) }
        const counts = new Map<string, number>()
        for (const x of list) counts.set(x.segmentId, (counts.get(x.segmentId) || 0) + 1)
        return Array.from(counts, ([segmentId, count]) => ({ segmentId, _count: { _all: count } }))
      }
      // Powers the star-rating + review-count badge on product cards (lib/product-stats.ts's
      // getProductStats) -- without this, every product's rating/reviewCount was silently 0
      // regardless of how many approved reviews actually existed for it.
      if (model === 'review' && args?.by?.includes('productId')) {
        const w = args?.where || {}
        const idsFilter: Set<string> | undefined = w.productId?.in ? new Set(w.productId.in) : undefined
        const sums = new Map<string, { total: number; count: number }>()
        for (const r of mockReviews) {
          if (idsFilter && !idsFilter.has(r.productId)) continue
          if (w.approved !== undefined && r.approved !== w.approved) continue
          const entry = sums.get(r.productId) || { total: 0, count: 0 }
          entry.total += r.rating
          entry.count += 1
          sums.set(r.productId, entry)
        }
        return Array.from(sums, ([productId, { total, count }]) => ({ productId, _avg: { rating: count ? total / count : null }, _count: { rating: count } }))
      }
      // Powers the "sold count" badge on product cards (lib/product-stats.ts) and the admin
      // dashboard's "Top products" panel (app/admin/page.tsx). The latter also passes
      // where.order.status.notIn/createdAt.gte plus orderBy/take -- without honoring those, the
      // panel silently included cancelled/refunded orders and all-time (not this-month) sales,
      // unsorted and uncapped, instead of this month's actual top 5 sellers.
      if (model === 'orderItem' && args?.by?.includes('productId')) {
        const w = args?.where || {}
        const idsFilter: Set<string> | undefined = w.productId?.in ? new Set(w.productId.in) : undefined
        const excludedStatuses: Set<string> | undefined = w.order?.status?.notIn ? new Set(w.order.status.notIn) : undefined
        const sums = new Map<string, number>()
        for (const o of mockOrders) {
          if (w.order?.paymentStatus !== undefined && o.paymentStatus !== w.order.paymentStatus) continue
          if (excludedStatuses && excludedStatuses.has(o.status)) continue
          if (w.order?.createdAt?.gte && new Date(o.createdAt) < new Date(w.order.createdAt.gte)) continue
          for (const it of o.items || []) {
            if (idsFilter && !idsFilter.has(it.productId)) continue
            sums.set(it.productId, (sums.get(it.productId) || 0) + it.quantity)
          }
        }
        let rows = Array.from(sums, ([productId, quantity]) => ({ productId, _sum: { quantity } }))
        const sumDir = args?.orderBy?._sum?.quantity
        if (sumDir === 'asc' || sumDir === 'desc') {
          rows = rows.sort((a, b) => sumDir === 'desc' ? b._sum.quantity - a._sum.quantity : a._sum.quantity - b._sum.quantity)
        }
        if (args?.take) rows = rows.slice(0, args.take)
        return rows
      }
      return []
    },
    aggregate: async (args?: any) => {
      if (model === 'inventoryMovement') {
        const w = args?.where || {}
        let list = mockInventoryMovements
        if (w.type) list = list.filter((x: any) => x.type === w.type)
        if (w.referenceId) list = list.filter((x: any) => x.referenceId === w.referenceId)
        if (w.inventoryId) list = list.filter((x: any) => x.inventoryId === w.inventoryId)
        const sum = list.reduce((s: number, x: any) => s + (x.quantity || 0), 0)
        return { _sum: { quantity: sum }, _count: { _all: list.length }, _avg: {}, _min: {}, _max: {} }
      }
      if (model === 'walletTransaction') {
        let list = mockWalletTransactions
        const w = args?.where || {}
        if (w.userId) list = list.filter((x) => x.userId === w.userId)
        if (w.currency) list = list.filter((x) => x.currency === w.currency)
        const sum = list.reduce((s, x) => s + (x.amount || 0), 0)
        return { _sum: { amount: sum }, _count: { _all: list.length }, _avg: {}, _min: {}, _max: {} }
      }
      if (model === 'coinTransaction') {
        let list = mockCoinTransactions
        const w = args?.where || {}
        if (w.userId) list = list.filter((x) => x.userId === w.userId)
        if (w.type) list = list.filter((x) => x.type === w.type)
        if (w.referenceId?.startsWith) list = list.filter((x) => typeof x.referenceId === 'string' && x.referenceId.startsWith(w.referenceId.startsWith))
        const sum = list.reduce((s, x) => s + (x.amount || 0), 0)
        return { _sum: { amount: sum }, _count: { _all: list.length }, _avg: {}, _min: {}, _max: {} }
      }
      // The payment-status webhook's refund-limit check leans on this to compute how much of an
      // order has already been refunded (`where: { orderId, status: { in: ['refunded',
      // 'partially_refunded'] } }`) before validating a new partial/final refund against the
      // remaining balance -- without a real branch this fell to the generic fallback below,
      // whose _sum.amount is undefined (not 0), so refundedSoFar was always computed as 0 and a
      // second refund webhook could push total refunds past the order's grand total.
      if (model === 'paymentTransaction') {
        const matches = findMockPaymentTransactions(args?.where || {})
        const sum = matches.reduce((s, m) => s + (m.transaction.amount || 0), 0)
        return { _sum: { amount: sum }, _count: { _all: matches.length }, _avg: {}, _min: {}, _max: {} }
      }
      return { _sum: {}, _count: {}, _avg: {}, _min: {}, _max: {} }
    },
    deleteMany: async (args?: any) => {
      if (model === 'setting' && args?.where?.key) {
        return { count: mockSettings.delete(args.where.key) ? 1 : 0 }
      }
      // Product delete's cascade cleanup and the CSV import's reassign-a-product's-collections
      // path both key this off productId, not collectionId -- without that branch, deleting a
      // product (or re-importing it with different collectionSlugs) left it stuck joined into
      // every collection it was ever in, since deriveCollectionProducts/joinCollectionProducts
      // still filter the (never-cleaned) mockCollectionProducts array by productId.
      if (model === 'collectionProduct' && (args?.where?.collectionId || args?.where?.productId)) {
        const before = mockCollectionProducts.length
        for (let i = mockCollectionProducts.length - 1; i >= 0; i--) {
          const row = mockCollectionProducts[i]
          if ((args.where.collectionId && row.collectionId === args.where.collectionId) || (args.where.productId && row.productId === args.where.productId)) mockCollectionProducts.splice(i, 1)
        }
        return { count: before - mockCollectionProducts.length }
      }
      if (model === 'metafieldValue' && args?.where?.ownerId) {
        const before = mockMetafieldValues.length
        for (let i = mockMetafieldValues.length - 1; i >= 0; i--) {
          const v = mockMetafieldValues[i]
          if (v.ownerId === args.where.ownerId && (args.where.ownerType === undefined || v.ownerType === args.where.ownerType)) mockMetafieldValues.splice(i, 1)
        }
        return { count: before - mockMetafieldValues.length }
      }
      if (model === 'walletTransaction' && args?.where?.userId) {
        const before = mockWalletTransactions.length
        for (let i = mockWalletTransactions.length - 1; i >= 0; i--) if (mockWalletTransactions[i].userId === args.where.userId) mockWalletTransactions.splice(i, 1)
        return { count: before - mockWalletTransactions.length }
      }
      // reset-password's atomic-consume guard leans on this being real: `where: { id,
      // expiresAt: { gt: now } }` must return count 0 (not the generic fallback's unconditional
      // count: 1) once the token has expired or was already consumed, or an expired/reused token
      // could still reset the account's password.
      if (model === 'passwordResetToken' && args?.where?.id) {
        const w = args.where
        const i = mockPasswordResetTokens.findIndex((x: any) => x.id === w.id && (w.expiresAt?.gt === undefined || x.expiresAt > w.expiresAt.gt))
        if (i >= 0) { mockPasswordResetTokens.splice(i, 1); return { count: 1 } }
        return { count: 0 }
      }
      if (model === 'passwordResetToken' && args?.where?.userId) {
        const before = mockPasswordResetTokens.length
        for (let i = mockPasswordResetTokens.length - 1; i >= 0; i--) if (mockPasswordResetTokens[i].userId === args.where.userId) mockPasswordResetTokens.splice(i, 1)
        return { count: before - mockPasswordResetTokens.length }
      }
      // orderNote rows are embedded per-order (see orderNote.create above), not a single top-level
      // array -- deleteCustomerCascade (lib/customers.ts) needs every note this user authored gone
      // across every order, not just one.
      if (model === 'orderNote' && args?.where?.userId) {
        let count = 0
        for (const o of mockOrders) {
          if (!o.notesHistory?.length) continue
          const before = o.notesHistory.length
          o.notesHistory = o.notesHistory.filter((n: any) => n.userId !== args.where.userId)
          count += before - o.notesHistory.length
        }
        return { count }
      }
      if (model === 'themeVersion' && args?.where?.id?.in) {
        const ids = new Set<string>(args.where.id.in)
        const before = mockThemeVersions.length
        for (let i = mockThemeVersions.length - 1; i >= 0; i--) if (ids.has(mockThemeVersions[i].id)) mockThemeVersions.splice(i, 1)
        return { count: before - mockThemeVersions.length }
      }
      if (model === 'liveVisitorSession') {
        const before = mockLiveVisitorSessions.size
        if (args?.where?.sessionId) {
          mockLiveVisitorSessions.delete(args.where.sessionId)
        } else if (args?.where?.lastSeenAt?.lt) {
          const cutoff = new Date(args.where.lastSeenAt.lt)
          for (const [id, v] of mockLiveVisitorSessions) if (v.lastSeenAt < cutoff) mockLiveVisitorSessions.delete(id)
        }
        return { count: before - mockLiveVisitorSessions.size }
      }
      // images/tags are embedded on the parent product row, so deleting them means mutating
      // that product's own array rather than splicing a top-level mock array.
      if (model === 'productImage' && args?.where?.productId) {
        const product = mockProducts.find((p: any) => p.id === args.where.productId)
        if (!product) return { count: 0 }
        const before = (product.images || []).length
        const notIn: string[] | undefined = args.where.id?.notIn
        product.images = notIn ? (product.images || []).filter((x: any) => notIn.includes(x.id)) : []
        return { count: before - product.images.length }
      }
      if (model === 'productTag' && args?.where?.productId) {
        const product = mockProducts.find((p: any) => p.id === args.where.productId) as any
        if (!product) return { count: 0 }
        const before = (product.tags || []).length
        product.tags = []
        return { count: before }
      }
      if (model === 'productVariant' && args?.where?.productId) {
        const before = mockProductVariants.length
        for (let i = mockProductVariants.length - 1; i >= 0; i--) if (mockProductVariants[i].productId === args.where.productId) mockProductVariants.splice(i, 1)
        return { count: before - mockProductVariants.length }
      }
      // Cleans up mockInventoryItems after a product delete so a since-derived (rather than
      // embedded) `product.inventory` doesn't leave orphaned rows visible on an admin-wide
      // inventory listing that queries inventoryItem directly by a now-deleted productId.
      if (model === 'inventoryItem' && args?.where?.productId) {
        const before = mockInventoryItems.length
        for (let i = mockInventoryItems.length - 1; i >= 0; i--) if (mockInventoryItems[i].productId === args.where.productId) mockInventoryItems.splice(i, 1)
        return { count: before - mockInventoryItems.length }
      }
      // deleteCustomerCascade (lib/customers.ts) leans on each of these being real -- MongoDB has
      // no native FK support, so scripts/prepare-mongodb-schema.mjs forces every @relation's
      // onDelete to NoAction at runtime regardless of what prisma/schema.prisma declares, meaning
      // deleteCustomerCascade is the only thing actually enforcing cascade-delete semantics.
      // Without these branches, deleting a customer silently left their address book, reviews,
      // wishlist, notifications, coin ledger, and tag/segment memberships all orphaned in place.
      if (model === 'address' && args?.where?.userId) {
        const before = mockAddresses.length
        for (let i = mockAddresses.length - 1; i >= 0; i--) if (mockAddresses[i].userId === args.where.userId) mockAddresses.splice(i, 1)
        return { count: before - mockAddresses.length }
      }
      // Product delete's cascade cleanup (app/api/admin/products/[id]/route.ts) also calls both
      // of these by productId, not userId -- without that branch, deleting a product left its
      // reviews and wishlist entries stranded in mockReviews/mockWishlistItems pointing at a
      // productId that no longer resolves to anything.
      if (model === 'review' && (args?.where?.userId || args?.where?.productId)) {
        const before = mockReviews.length
        for (let i = mockReviews.length - 1; i >= 0; i--) {
          const row = mockReviews[i]
          if ((args.where.userId && row.userId === args.where.userId) || (args.where.productId && row.productId === args.where.productId)) mockReviews.splice(i, 1)
        }
        return { count: before - mockReviews.length }
      }
      if (model === 'wishlistItem' && (args?.where?.userId || args?.where?.productId)) {
        const before = mockWishlistItems.length
        for (let i = mockWishlistItems.length - 1; i >= 0; i--) {
          const row = mockWishlistItems[i]
          if ((args.where.userId && row.userId === args.where.userId) || (args.where.productId && row.productId === args.where.productId)) mockWishlistItems.splice(i, 1)
        }
        return { count: before - mockWishlistItems.length }
      }
      if (model === 'notification' && args?.where?.userId) {
        const before = mockNotifications.length
        for (let i = mockNotifications.length - 1; i >= 0; i--) if (mockNotifications[i].userId === args.where.userId) mockNotifications.splice(i, 1)
        return { count: before - mockNotifications.length }
      }
      if (model === 'coinTransaction' && args?.where?.userId) {
        const before = mockCoinTransactions.length
        for (let i = mockCoinTransactions.length - 1; i >= 0; i--) if (mockCoinTransactions[i].userId === args.where.userId) mockCoinTransactions.splice(i, 1)
        return { count: before - mockCoinTransactions.length }
      }
      if (model === 'customerTagMember' && args?.where?.customerId) {
        const before = mockCustomerTagMembers.length
        for (let i = mockCustomerTagMembers.length - 1; i >= 0; i--) if (mockCustomerTagMembers[i].customerId === args.where.customerId) mockCustomerTagMembers.splice(i, 1)
        return { count: before - mockCustomerTagMembers.length }
      }
      if (model === 'customerSegmentMember' && args?.where?.customerId) {
        const before = mockCustomerSegmentMembers.length
        for (let i = mockCustomerSegmentMembers.length - 1; i >= 0; i--) if (mockCustomerSegmentMembers[i].customerId === args.where.customerId) mockCustomerSegmentMembers.splice(i, 1)
        return { count: before - mockCustomerSegmentMembers.length }
      }
      return { count: 0 }
    },
  }
  return {
    ...handler,
    // The manual inventory-adjustment route calls this inside a $transaction right after
    // writing the stock change and movement log -- nothing in this mock ever defined it, so
    // the call threw `TypeError: ... is not a function` after the mutation had already taken
    // effect, meaning the route reported a 500 while the adjustment (and a retry) silently
    // double-applied. Real Prisma's own semantics: same as findUnique, but throw instead of
    // returning null.
    findUniqueOrThrow: async (args?: any) => {
      const found = await handler.findUnique(args)
      if (!found) throw new Error(`No ${model} found for the given where clause.`)
      return found
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
