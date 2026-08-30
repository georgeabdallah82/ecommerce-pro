import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const sourceRoot = new URL('../prisma/', import.meta.url)
const targetRoot = new URL('../prisma/mongodb-schema/', import.meta.url)

await mkdir(new URL('./models/', targetRoot), { recursive: true })

function convert(schema, sourceName) {
  schema = schema.replace(
    'provider = "postgresql"',
    'provider = "mongodb"',
  )

  // MongoDB stores every Prisma model id in the mandatory _id field.
  schema = schema.replace(
    /^(\s*id\s+String\s+@id\s+@default\(cuid\(\)\))(\s*)$/gm,
    '$1 @map("_id")$2',
  )

  // MongoDB does not support composite @@id. Convert each join model to a
  // normal CUID _id while retaining the old logical pair as @@unique.
  const compositeIdModels = new Map([
    ['CollectionProduct', ['collectionId', 'productId']],
    ['CustomerTagMember', ['tagId', 'customerId']],
    ['CustomerSegmentMember', ['segmentId', 'customerId']],
  ])

  for (const [model, fields] of compositeIdModels) {
    const fieldPattern = new RegExp(
      `(model ${model} \\{\\n)([\\s\\S]*?)(\\n\\s*@@id\\(\\[${fields.join(', ')}\\]\\))`,
    )
    schema = schema.replace(fieldPattern, (_match, header, body, idLine) => {
      if (!/\bid\s+String\s+@id/.test(body)) {
        body = `\\n  id String @id @default(cuid()) @map("_id")${body}`
      }
      return `${header}${body}\\n  @@unique([${fields.join(', ')}])`
    })
  }

  // MongoDB/Prisma requires every field in a compound unique constraint to be
  // mandatory. These PostgreSQL constraints contain nullable fields, so they
  // are replaced with indexes for the first migration phase. Application-level
  // uniqueness is audited separately before production cutover.
  schema = schema.replace(
    '  @@unique([productId, variantId, location])\\n',
    '  @@index([productId, variantId, location])\\n',
  )
  schema = schema.replace(
    '  @@unique([userId, referenceId, type])\\n',
    '  @@index([userId, referenceId, type])\\n',
  )

  // Prisma emulates referential actions for MongoDB. The PostgreSQL relation
  // graph contains multiple cycles/cascade paths. Start with explicit
  // NoAction semantics; safe cascades will be restored selectively after the
  // application delete/update paths have been audited.
  schema = schema.replace(/@relation\\(([^\\n]*)\\)/g, (_match, body) => {
    if (!body.includes('fields:') || !body.includes('references:')) return _match
    const normalized = body
      .replace(/,\\s*onDelete:\\s*\\w+/g, '')
      .replace(/,\\s*onUpdate:\\s*\\w+/g, '')
    return `@relation(${normalized}, onDelete: NoAction, onUpdate: NoAction)`
  })

  console.log(`[mongodb-schema] converted ${sourceName}`)
  return schema
}

const schema = await readFile(new URL('schema.prisma', sourceRoot), 'utf8')
const parity = await readFile(new URL('models/shopify-parity.prisma', sourceRoot), 'utf8')

await writeFile(new URL('schema.prisma', targetRoot), convert(schema, 'schema.prisma'))
await writeFile(new URL('models/shopify-parity.prisma', targetRoot), convert(parity, 'models/shopify-parity.prisma'))

void root
