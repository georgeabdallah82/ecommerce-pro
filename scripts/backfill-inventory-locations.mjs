// One-time migration: InventoryItem used to carry a free-text `location`
// string with no relation to the real StoreLocation model admins manage in
// Admin > Operations. The schema now uses a real `locationId` foreign key
// instead. Run this ONCE against production (before or after `db push` --
// it reads the legacy `location` field via a raw Mongo command, which works
// regardless of what the current Prisma-generated client declares) to carry
// forward every existing string value onto a matching StoreLocation.
//
// Usage: DATABASE_URL='mongodb://...' node scripts/backfill-inventory-locations.mjs
// (a `prisma://` Accelerate URL will not work here -- raw commands need a
// direct MongoDB connection string.)
//
// Safe to re-run: items that already have a locationId are left untouched,
// and locations are matched by name (case-insensitive) before creating a
// new one, so re-running never creates duplicates.

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required (a direct mongodb:// connection string, not a prisma:// Accelerate URL)')

function slugify(input) {
  return input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') || 'location'
}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function findRawInventoryItemsWithLocation() {
  const docs = []
  let cursor = await db.$runCommandRaw({
    find: 'InventoryItem',
    filter: { location: { $exists: true, $type: 'string', $ne: '' }, locationId: { $exists: false } },
    projection: { location: 1 },
    batchSize: 1000,
  })
  docs.push(...cursor.cursor.firstBatch)
  while (cursor.cursor.id && cursor.cursor.id.toString() !== '0') {
    cursor = await db.$runCommandRaw({ getMore: cursor.cursor.id, collection: 'InventoryItem', batchSize: 1000 })
    docs.push(...cursor.cursor.nextBatch)
  }
  return docs
}

async function main() {
  const docs = await findRawInventoryItemsWithLocation()
  console.log(`[backfill-inventory-locations] found ${docs.length} InventoryItem row(s) with a legacy location string and no locationId`)
  if (!docs.length) return

  const locationCache = new Map() // lowercased name -> StoreLocation.id
  let created = 0
  let updated = 0

  for (const doc of docs) {
    const rawName = String(doc.location || '').trim()
    if (!rawName) continue
    const key = rawName.toLowerCase()
    let locationId = locationCache.get(key)
    if (!locationId) {
      const existing = await db.storeLocation.findFirst({ where: { name: { equals: rawName, mode: 'insensitive' } } })
      if (existing) {
        locationId = existing.id
      } else {
        const handle = `${slugify(rawName)}-${Math.random().toString(36).slice(2, 8)}`
        const noLocationsYet = (await db.storeLocation.count()) === 0
        const location = await db.storeLocation.create({ data: { name: rawName, handle, isDefault: noLocationsYet } })
        locationId = location.id
        created += 1
        console.log(`[backfill-inventory-locations] created StoreLocation "${rawName}" (${location.id})`)
      }
      locationCache.set(key, locationId)
    }
    await db.inventoryItem.update({ where: { id: doc._id }, data: { locationId } })
    updated += 1
  }

  console.log(`[backfill-inventory-locations] done: ${created} location(s) created, ${updated} inventory item(s) updated`)
}

await main()
await db.$disconnect()
