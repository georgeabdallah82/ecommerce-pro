import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rawSource = process.env.SOURCE_DATABASE_URL?.trim()
const rawTarget = process.env.TARGET_DATABASE_URL?.trim()
if (!rawSource) throw new Error('SOURCE_DATABASE_URL is required')
if (!rawTarget) throw new Error('TARGET_DATABASE_URL is required')

function parseMongo(url, label) {
  if (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://')) {
    throw new Error(`${label} must be a MongoDB connection string`)
  }
  const parsed = new URL(url)
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!dbName) throw new Error(`${label} must include an explicit database name`)
  return { parsed, dbName }
}

function parsePostgres(url, label) {
  const parsed = new URL(url)
  if (!parsed.protocol.startsWith('postgres')) throw new Error(`${label} must be a PostgreSQL connection string`)
  return { parsed, dbName: decodeURIComponent(parsed.pathname.replace(/^\//, '')) }
}

const source = parsePostgres(rawSource, 'SOURCE_DATABASE_URL')
const target = parseMongo(rawTarget, 'TARGET_DATABASE_URL')

const forbidden = new Set(['ecommerce_staging', 'staging', 'test', 'testing', 'development', 'dev'])
if (forbidden.has(target.dbName.toLowerCase())) {
  throw new Error(`Production target database '${target.dbName}' is not allowed`)
}

if (source.parsed.hostname === target.parsed.hostname && source.dbName === target.dbName) {
  throw new Error('Production target appears to be the source database; refusing to continue')
}

console.log(`[production-preflight] target database: ${target.dbName}`)
console.log('[production-preflight] source/target database safety check passed')

const schemaPath = resolve(process.cwd(), 'prisma/mongodb-schema/schema.prisma')
const schema = await readFile(schemaPath, 'utf8')
const models = [...schema.matchAll(/model\s+(\w+)\s*\{/g)].map(match => match[1])

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: rawTarget } } })
try {
  const collectionsResult = await db.$runCommandRaw({ listCollections: 1, nameOnly: true })
  const collections = (collectionsResult?.cursor?.firstBatch ?? [])
    .map(item => item.name)
    .filter(name => !String(name).startsWith('system.'))

  const populated = []
  for (const collection of collections) {
    const result = await db.$runCommandRaw({ count: collection, query: {} })
    const count = Number(result?.n ?? 0)
    if (count > 0) populated.push(`${collection}:${count}`)
  }

  if (populated.length) {
    throw new Error(`Production MongoDB target is not empty: ${populated.join(', ')}`)
  }

  const existingModelCollections = collections.filter(name => models.includes(name))
  console.log(`[production-preflight] target is empty (${existingModelCollections.length} model collections already initialized)`)
} finally {
  await db.$disconnect()
}
