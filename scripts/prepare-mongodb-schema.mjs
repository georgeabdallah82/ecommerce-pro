import { readFile, writeFile } from 'node:fs/promises'

const sourcePath = new URL('../prisma/schema.prisma', import.meta.url)
const targetPath = new URL('../prisma/schema.mongodb.prisma', import.meta.url)

let schema = await readFile(sourcePath, 'utf8')

schema = schema.replace(
  'provider = "postgresql"',
  'provider = "mongodb"',
)

// MongoDB stores every Prisma model id in the mandatory _id field.
schema = schema.replace(
  /^(\s*id\s+String\s+@id\s+@default\(cuid\(\)\))(\s*)$/gm,
  '$1 @map("_id")$2',
)

// MongoDB does not support composite @@id. Preserve the old logical key as
// a compound unique index and give the join document its own stable _id.
schema = schema.replace(
  /model CollectionProduct \{\n  collectionId String\n  productId    String\n/g,
  'model CollectionProduct {\n  id           String     @id @default(cuid()) @map("_id")\n  collectionId String\n  productId    String\n',
)
schema = schema.replace(
  '  @@id([collectionId, productId])',
  '  @@unique([collectionId, productId])',
)

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

// Prisma emulates referential actions for MongoDB. The existing PostgreSQL
// graph contains several cycles/multiple cascade paths, which MongoDB's
// connector rejects. Start the migration with explicit NoAction semantics;
// destructive cascade behavior will be reintroduced only where the application
// audit proves it is safe and required.
schema = schema.replace(/@relation\(([^\n]*)\)/g, (_match, body) => {
  if (!body.includes('fields:') || !body.includes('references:')) return _match
  const normalized = body
    .replace(/,\s*onDelete:\s*\w+/g, '')
    .replace(/,\s*onUpdate:\s*\w+/g, '')
  return `@relation(${normalized}, onDelete: NoAction, onUpdate: NoAction)`
})

await writeFile(targetPath, schema)
console.log('[mongodb-schema] generated prisma/schema.mongodb.prisma')
