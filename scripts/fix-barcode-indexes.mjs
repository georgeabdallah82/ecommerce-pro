// One-time fix for the production MongoDB barcode indexes.
//
// The first `prisma db push` created plain unique indexes on Product.barcode and
// ProductVariant.barcode. MongoDB counts every missing/null barcode as the same key, so once
// one product had no barcode, creating any other product without one failed with a
// unique-constraint error. This replaces each with a *partial* unique index: real barcodes
// stay unique, empty ones are ignored. Safe to run more than once.
//
// Run with DATABASE_URL pointing at the MongoDB database (see
// .github/workflows/mongodb-fix-barcode-indexes.yml). DRY_RUN=1 only reports.
import { PrismaClient } from '@prisma/client'

const dryRun = process.env.DRY_RUN === '1'
const db = new PrismaClient()

async function fixCollection(collection) {
  const listed = await db.$runCommandRaw({ listIndexes: collection })
  const indexes = listed?.cursor?.firstBatch ?? []
  const barcodeIndexes = indexes.filter(ix => ix.key && Object.keys(ix.key).length === 1 && ix.key.barcode !== undefined)
  const wanted = `${collection}_barcode_unique_when_set`
  console.log(`[${collection}] barcode indexes now: ${barcodeIndexes.map(ix => `${ix.name}${ix.unique ? ' (unique)' : ''}${ix.partialFilterExpression ? ' (partial)' : ''}`).join(', ') || 'none'}`)

  // Real barcodes must already be unique, or the new index can't be built.
  const dupes = await db.$runCommandRaw({
    aggregate: collection,
    pipeline: [
      { $match: { barcode: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$barcode', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ],
    cursor: {},
  })
  const duplicateBarcodes = dupes?.cursor?.firstBatch ?? []
  if (duplicateBarcodes.length) throw new Error(`[${collection}] duplicate barcodes must be fixed first: ${duplicateBarcodes.map(d => d._id).join(', ')}`)

  for (const ix of barcodeIndexes) {
    if (ix.name === wanted) continue
    console.log(`[${collection}] ${dryRun ? 'would drop' : 'dropping'} ${ix.name}`)
    if (!dryRun) await db.$runCommandRaw({ dropIndexes: collection, index: ix.name })
  }
  if (barcodeIndexes.some(ix => ix.name === wanted)) { console.log(`[${collection}] ${wanted} already present`); return }
  console.log(`[${collection}] ${dryRun ? 'would create' : 'creating'} ${wanted}`)
  if (!dryRun) {
    await db.$runCommandRaw({
      createIndexes: collection,
      indexes: [{ key: { barcode: 1 }, name: wanted, unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }],
    })
  }
}

try {
  for (const collection of ['Product', 'ProductVariant']) await fixCollection(collection)
  console.log(dryRun ? 'Dry run finished, nothing changed.' : 'Barcode indexes fixed.')
} finally {
  await db.$disconnect()
}
