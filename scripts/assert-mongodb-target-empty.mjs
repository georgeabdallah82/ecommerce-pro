const rawTargetUrl = process.env.TARGET_DATABASE_URL?.trim()
const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim()

if (!rawTargetUrl) throw new Error('TARGET_DATABASE_URL is required')
if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is required')

const target = new URL(rawTargetUrl)
const source = new URL(sourceUrl)

if (!target.pathname || target.pathname === '/') {
  throw new Error('Production MongoDB target must include an explicit database name in the URI')
}

const targetDatabase = decodeURIComponent(target.pathname.slice(1)).split('/')[0]
if (!targetDatabase || targetDatabase === 'ecommerce_staging' || targetDatabase === 'test') {
  throw new Error(`Refusing production migration target database: ${targetDatabase || '(empty)'}`)
}

if (target.toString() === source.toString()) {
  throw new Error('SOURCE_DATABASE_URL and TARGET_DATABASE_URL must be different')
}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: target.toString() } } })

try {
  const listed = await db.$runCommandRaw({ listCollections: 1, nameOnly: true })
  const collections = Array.isArray(listed?.cursor?.firstBatch) ? listed.cursor.firstBatch : []
  const nonSystem = collections
    .map(item => item?.name)
    .filter(name => typeof name === 'string' && !name.startsWith('system.'))

  const populated = []
  for (const name of nonSystem) {
    const result = await db.$runCommandRaw({ count: name, query: {} })
    const count = Number(result?.n ?? 0)
    if (count > 0) populated.push(`${name}=${count}`)
  }

  if (populated.length) {
    throw new Error(`Production MongoDB target is not empty: ${populated.join(', ')}`)
  }

  console.log(`[production-mongodb] target ${targetDatabase} is empty and distinct from source`)
} finally {
  await db.$disconnect()
}
