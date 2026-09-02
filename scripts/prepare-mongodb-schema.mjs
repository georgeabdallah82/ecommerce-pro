import { mkdir, readFile, writeFile } from 'node:fs/promises'

const sourceRoot = new URL('../prisma/', import.meta.url)
const targetRoot = new URL('../prisma/mongodb-schema/', import.meta.url)

await mkdir(new URL('./models/', targetRoot), { recursive: true })

function convert(schema, sourceName) {
  schema = schema.replace('provider = "postgresql"', 'provider = "mongodb"')

  // MongoDB/Render production runs on Debian with OpenSSL 3. Generate the
  // MongoDB Prisma client with both the local/native engine and the exact
  // production runtime engine so the prebuilt image can execute on Render.
  schema = schema.replace(
    /generator client \{\n\s*provider = "prisma-client-js"\n\}/m,
    'generator client {\n  provider = "prisma-client-js"\n  binaryTargets = ["native", "debian-openssl-3.0.x"]\n}',
  )

  // MongoDB stores every Prisma model id in the mandatory _id field.
  schema = schema.replace(
    /^(\s*id\s+String\s+@id\s+@default\(cuid\(\)\))(\s*)$/gm,
    '$1 @map("_id")$2',
  )

  // MongoDB does not support composite @@id. Convert each join model to a
  // normal CUID _id while retaining the old logical pair as @@unique.
  const compositeIdModels = [
    ['CollectionProduct', 'collectionId', 'productId'],
    ['CustomerTagMember', 'tagId', 'customerId'],
    ['CustomerSegmentMember', 'segmentId', 'customerId'],
  ]

  for (const [model, first, second] of compositeIdModels) {
    schema = schema.replace(
      new RegExp(`model ${model} \\{\\n`),
      `model ${model} {\n  id String @id @default(cuid()) @map("_id")\n`,
    )
    schema = schema.replace(
      new RegExp(`\\n\\s*@@id\\(\\[${first}, ${second}\\]\\)`),
      `\n  @@unique([${first}, ${second}])`,
    )
  }

  // MongoDB/Prisma requires every field in a compound unique constraint to be
  // mandatory. These PostgreSQL constraints contain nullable fields, so they
  // are replaced with indexes for the first migration phase. Application-level
  // uniqueness is audited separately before production cutover.
  schema = schema.replace(
    '  @@unique([productId, variantId, location])\n',
    '  @@index([productId, variantId, location])\n',
  )
  schema = schema.replace(
    '  @@unique([userId, referenceId, type])\n',
    '  @@index([userId, referenceId, type])\n',
  )

  // Prisma emulates referential actions for MongoDB. The PostgreSQL relation
  // graph contains multiple cycles/cascade paths. Start with explicit
  // NoAction semantics; safe cascades will be restored selectively after the
  // application delete/update paths have been audited.
  schema = schema.replace(/@relation\(([^\n]*)\)/g, (_match, body) => {
    if (!body.includes('fields:') || !body.includes('references:')) return _match
    const normalized = body
      .replace(/,\s*onDelete:\s*\w+/g, '')
      .replace(/,\s*onUpdate:\s*\w+/g, '')
    return `@relation(${normalized}, onDelete: NoAction, onUpdate: NoAction)`
  })

  if (sourceName === 'schema.prisma' && !/\bmodel\s+LiveVisitorSession\s*\{/.test(schema)) {
    schema += `\n\nmodel LiveVisitorSession {\n  id          String   @id @default(cuid()) @map("_id")\n  sessionId   String   @unique\n  userId      String?\n  path        String\n  country     String?\n  city        String?\n  region      String?\n  latitude    Float?\n  longitude   Float?\n  device      String?\n  browser     String?\n  os          String?\n  referrer    String?\n  firstSeenAt DateTime @default(now())\n  lastSeenAt  DateTime @default(now())\n  @@index([lastSeenAt])\n  @@index([userId])\n}\n`
  }

  // DeliveryTracking is intentionally MongoDB-only operational state. It is
  // not part of the PostgreSQL source schema, so the migration system does
  // not copy or reconcile these runtime delivery-control records.
  if (sourceName === 'schema.prisma' && !/\bmodel\s+DeliveryTracking\s*\{/.test(schema)) {
    schema += `\n\nmodel DeliveryTracking {\n  id                    String   @id @default(cuid()) @map("_id")\n  orderId               String   @unique\n  trackingToken         String   @unique\n  latitude              Float?\n  longitude             Float?\n  etaMinutes            Int?\n  lastLocationUpdatedAt DateTime?\n  active                Boolean  @default(false)\n  createdAt             DateTime @default(now())\n  updatedAt             DateTime @updatedAt\n  @@index([active])\n  @@index([lastLocationUpdatedAt])\n}\n`
  }

  console.log(`[mongodb-schema] converted ${sourceName}`)
  return schema
}

const schema = await readFile(new URL('schema.prisma', sourceRoot), 'utf8')
const parity = await readFile(new URL('models/shopify-parity.prisma', sourceRoot), 'utf8')

await writeFile(new URL('schema.prisma', targetRoot), convert(schema, 'schema.prisma'))
await writeFile(new URL('models/shopify-parity.prisma', targetRoot), convert(parity, 'models/shopify-parity.prisma'))
