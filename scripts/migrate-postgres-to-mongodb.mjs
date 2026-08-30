import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const mode = process.argv[2]
const root = process.cwd()
const tmpRoot = resolve(root, '.migration-tmp')
const sourceSchema = resolve(tmpRoot, 'source-schema.prisma')
const exportRoot = resolve(tmpRoot, 'export')
const targetSchemaDir = resolve(root, 'prisma/mongodb-schema')

function runPrisma(args, env) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(command, ['prisma', ...args], { stdio: 'inherit', env })
}

function modelsFromSchema(schema) {
  return [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map(m => ({ name: m[1], body: m[2] }))
}

function fieldsFromModel(body) {
  const fields = new Map()
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(\w+)\s+(\w+)(\?)?(?:\s+@.*)?$/)
    if (m) fields.set(m[1], { type: m[2], optional: Boolean(m[3]) })
  }
  return fields
}

const composites = new Map([
  ['CollectionProduct', ['collectionId', 'productId']],
  ['CustomerTagMember', ['tagId', 'customerId']],
  ['CustomerSegmentMember', ['segmentId', 'customerId']],
])

function delegateName(name) { return name[0].toLowerCase() + name.slice(1) }
function deterministicId(model, row) {
  const keys = composites.get(model)
  if (!keys) return row.id
  const value = keys.map(key => String(row[key] ?? '')).join('|')
  return `${model.toLowerCase()}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

async function prepareSourceSchema() {
  const base = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8')
  const parity = await readFile(resolve(root, 'prisma/models/shopify-parity.prisma'), 'utf8')
  await mkdir(tmpRoot, { recursive: true })
  await writeFile(sourceSchema, `${base}\n\n${parity}`.replace('url      = env("DATABASE_URL")', 'url      = env("SOURCE_DATABASE_URL")'))
}

async function exportData() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is required')
  await prepareSourceSchema()
  await rm(exportRoot, { recursive: true, force: true })
  await mkdir(exportRoot, { recursive: true })
  runPrisma(['generate', '--schema', sourceSchema], { ...process.env, SOURCE_DATABASE_URL: sourceUrl })
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: sourceUrl } } })
  const schema = await readFile(sourceSchema, 'utf8')
  try {
    for (const model of modelsFromSchema(schema)) {
      const delegate = db[delegateName(model.name)]
      if (!delegate?.findMany) throw new Error(`Missing Prisma delegate: ${model.name}`)
      const fields = fieldsFromModel(model.body)
      const output = resolve(exportRoot, `${model.name}.ndjson`)
      const composite = composites.has(model.name)
      let skip = 0
      let rows
      do {
        rows = await delegate.findMany({ take: 500, skip, orderBy: composite ? composites.get(model.name).map(field => ({ [field]: 'asc' })) : { id: 'asc' } })
        for (const sourceRow of rows) {
          const row = { ...sourceRow, id: deterministicId(model.name, sourceRow) }
          for (const [field, definition] of fields) if (definition.type === 'DateTime' && row[field] instanceof Date) row[field] = row[field].toISOString()
          await appendFile(output, JSON.stringify(row) + '\n')
        }
        skip += rows.length
      } while (rows.length)
      console.log(`[migration-export] ${model.name}: ${skip}`)
    }
  } finally {
    await db.$disconnect()
  }
}

async function importData() {
  const targetUrl = process.env.TARGET_DATABASE_URL
  if (!targetUrl) throw new Error('TARGET_DATABASE_URL is required')
  const schema = await readFile(resolve(targetSchemaDir, 'schema.prisma'), 'utf8')
  runPrisma(['generate', '--schema', targetSchemaDir], { ...process.env, DATABASE_URL: targetUrl })
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } })
  try {
    for (const model of modelsFromSchema(schema)) {
      const delegate = db[delegateName(model.name)]
      const input = resolve(exportRoot, `${model.name}.ndjson`)
      const text = await readFile(input, 'utf8').catch(() => '')
      if (!text.trim()) continue
      const fields = fieldsFromModel(model.body)
      const rows = text.trimEnd().split('\n').map(line => {
        const row = JSON.parse(line)
        for (const [field, definition] of fields) if (definition.type === 'DateTime' && typeof row[field] === 'string') row[field] = new Date(row[field])
        return row
      })
      for (let offset = 0; offset < rows.length; offset += 500) await delegate.createMany({ data: rows.slice(offset, offset + 500) })
      console.log(`[migration-import] ${model.name}: ${rows.length}`)
    }
  } finally {
    await db.$disconnect()
  }
}

if (!['export', 'import'].includes(mode)) throw new Error('Usage: node scripts/migrate-postgres-to-mongodb.mjs export|import')
if (mode === 'export') await exportData()
else await importData()
