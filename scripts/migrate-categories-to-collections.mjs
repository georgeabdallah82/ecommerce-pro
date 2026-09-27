// One-time migration: consolidates the Category taxonomy into Collections, ahead of removing
// the Category model entirely. For each Category, finds-or-creates a Collection with the same
// slug, then links every product currently assigned that category into the collection. Also
// rewrites any saved navigation links pointing at /shop?category=<slug> to /collections/<slug>
// so existing menus don't dead-link once the category query filter is removed from app/shop.
//
// Idempotent: safe to re-run. Existing collections (matched by slug) are reused rather than
// duplicated, and a product already linked to a collection is left alone.
//
// IMPORTANT: this script and the removal of the Category model from prisma/schema.prisma
// landed in the same commit, so by the time this runs against `main` the generated Prisma
// Client no longer has `db.category` or `Product.categoryId` at all -- there is no commit
// where both the script and the typed models exist together. Reads of the legacy Category
// collection and the legacy Product.categoryId field therefore go through db.$runCommandRaw
// (a raw MongoDB `find`, bypassing the client's types) instead of typed Prisma calls. Both
// fields are plain Prisma `String`s with no @map beyond `id -> _id`, so the raw documents
// come back as ordinary JSON with no BSON unwrapping needed. Confirmed against a real run:
// the typed db.category.findMany() throws "Cannot read properties of undefined (reading
// 'findMany')" the instant this workflow checks out main, since Category no longer exists
// as a Prisma model -- only $runCommandRaw can still see the underlying collection.
//
// Usage: DATABASE_URL=<mongodb-or-accelerate-url> node scripts/migrate-categories-to-collections.mjs [--dry-run]

const dryRun = process.argv.includes('--dry-run')
const rawUrl = process.env.DATABASE_URL
if (!rawUrl) throw new Error('DATABASE_URL is required')

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: rawUrl } } })

function log(...args) { console.log('[migrate-categories]', ...args) }

async function rawFind(collectionName, filter) {
  const result = await db.$runCommandRaw({ find: collectionName, filter, limit: 100000 })
  return Array.isArray(result?.cursor?.firstBatch) ? result.cursor.firstBatch : []
}

async function migrateNavigationSetting(key, slugMap) {
  const row = await db.setting.findUnique({ where: { key } })
  if (!row) return { key, changed: 0 }
  let items
  try { items = JSON.parse(row.value) } catch { return { key, changed: 0 } }
  if (!Array.isArray(items)) return { key, changed: 0 }

  let changed = 0
  const rewritten = items.map(item => {
    if (typeof item?.url !== 'string') return item
    const match = item.url.match(/^\/shop\?category=([^&]+)$/)
    if (!match) return item
    const collectionSlug = slugMap.get(decodeURIComponent(match[1]))
    if (!collectionSlug) return item
    changed++
    return { ...item, url: `/collections/${collectionSlug}` }
  })

  if (changed > 0 && !dryRun) {
    await db.setting.update({ where: { key }, data: { value: JSON.stringify(rewritten) } })
  }
  return { key, changed }
}

async function main() {
  const rawCategories = await rawFind('Category', {})
  const categories = rawCategories.map(c => ({ ...c, id: c._id }))
  log(`found ${categories.length} categories`)

  const slugMap = new Map() // categorySlug -> collectionSlug (identical today, kept as a map for clarity/future-proofing)
  let collectionsCreated = 0
  let collectionsReused = 0
  let productsLinked = 0

  for (const category of categories) {
    let collection = await db.collection.findUnique({ where: { slug: category.slug } })
    if (collection) {
      collectionsReused++
      if (collection.name !== category.name) {
        log(`WARNING: collection "${collection.slug}" already exists as "${collection.name}", merging category "${category.name}" into it -- verify this is intended`)
      }
    } else {
      collectionsCreated++
      if (!dryRun) {
        collection = await db.collection.create({
          data: {
            name: category.name,
            slug: category.slug,
            description: category.description,
            imageUrl: category.imageUrl,
            isActive: category.isActive,
            sortOrder: category.sortOrder,
          },
        })
      } else {
        collection = { id: `dry-run-${category.id}` }
      }
    }
    slugMap.set(category.slug, category.slug)

    const rawProducts = await rawFind('Product', { categoryId: category.id })
    for (const rawProduct of rawProducts) {
      const productId = rawProduct._id
      if (dryRun) { productsLinked++; continue }
      const alreadyLinked = await db.collectionProduct.findFirst({ where: { collectionId: collection.id, productId } })
      if (!alreadyLinked) {
        await db.collectionProduct.create({ data: { collectionId: collection.id, productId, sortOrder: 0 } })
        productsLinked++
      }
    }
  }

  const navResults = await Promise.all([
    migrateNavigationSetting('navigation.main', slugMap),
    migrateNavigationSetting('navigation.draft', slugMap),
  ])

  log(`collections created: ${collectionsCreated}, reused: ${collectionsReused}`)
  log(`product-collection links created: ${productsLinked}`)
  for (const result of navResults) log(`navigation "${result.key}": ${result.changed} link(s) rewritten`)
  if (dryRun) log('dry run -- no writes were made')
}

main()
  .catch(err => { console.error('[migrate-categories] failed:', err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
