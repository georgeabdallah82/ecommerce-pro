import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const tmpRoot = resolve(root, '.migration-tmp')
const manifestPath = resolve(tmpRoot, 'manifest.json')
const targetSchemaPath = resolve(root, 'prisma/mongodb-schema/schema.prisma')
const targetUrl = process.env.TARGET_DATABASE_URL
if (!targetUrl) throw new Error('TARGET_DATABASE_URL is required')

function modelsFromSchema(schema) {
  return [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map(m => ({ name: m[1], body: m[2] }))
}
function delegateName(name) { return name[0].toLowerCase() + name.slice(1) }
function canonical(row) {
  const out = {}
  for (const key of Object.keys(row).sort()) {
    const value = row[key]
    if (value !== undefined) out[key] = value instanceof Date ? value.toISOString() : value
  }
  return JSON.stringify(out)
}
function hashRows(rows) {
  const hash = createHash('sha256')
  for (const row of rows) hash.update(canonical(row) + '\n')
  return hash.digest('hex')
}
function relationDefs(body) {
  const defs = []
  const relationRe = /^(\s*\w+\s+\w+\??\s+)@relation\(([^\n]+)\)/gm
  for (const match of body.matchAll(relationRe)) {
    const args = match[2]
    const fields = args.match(/fields:\s*\[([^\]]+)\]/)?.[1]
    const references = args.match(/references:\s*\[([^\]]+)\]/)?.[1]
    if (!fields || !references) continue
    const fieldNames = fields.split(',').map(x => x.trim())
    const referenceNames = references.split(',').map(x => x.trim())
    const target = match[1].trim().match(/^\w+\s+(\w+)\??\s*$/)?.[1]
    if (!target || fieldNames.length !== referenceNames.length) continue
    defs.push({ target, fields: fieldNames, references: referenceNames })
  }
  return defs
}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: targetUrl } } })
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const schema = await readFile(targetSchemaPath, 'utf8')
const models = modelsFromSchema(schema)
const failures = []

try {
  for (const model of models) {
    const expected = manifest.models[model.name]
    if (!expected) {
      failures.push(`${model.name}: missing source manifest entry`)
      continue
    }
    const delegate = db[delegateName(model.name)]
    if (!delegate?.findMany) {
      failures.push(`${model.name}: missing Prisma delegate`)
      continue
    }
    const rows = await delegate.findMany({ orderBy: { id: 'asc' } })
    const actual = { count: rows.length, sha256: hashRows(rows) }
    if (actual.count !== expected.count) failures.push(`${model.name}: count ${actual.count} != ${expected.count}`)
    if (actual.sha256 !== expected.sha256) failures.push(`${model.name}: sha256 mismatch`)
    console.log(`[migration-validate] ${model.name}: ${actual.count} rows, checksum ${actual.sha256 === expected.sha256 ? 'OK' : 'MISMATCH'}`)
  }

  // Full referential-integrity validation using the relation graph in the Prisma schema.
  for (const model of models) {
    const delegate = db[delegateName(model.name)]
    if (!delegate?.findMany) continue
    for (const relation of relationDefs(model.body)) {
      const targetDelegate = db[delegateName(relation.target)]
      if (!targetDelegate?.findUnique) {
        failures.push(`${model.name}.${relation.fields.join(',')}: target delegate missing (${relation.target})`)
        continue
      }
      const select = Object.fromEntries(relation.fields.map(field => [field, true]))
      const rows = await delegate.findMany({ select })
      const seen = new Set()
      for (const row of rows) {
        const values = relation.fields.map(field => row[field])
        if (values.some(value => value === null || value === undefined)) continue
        const key = values.map(String).join('|')
        if (seen.has(key)) continue
        seen.add(key)
        const where = Object.fromEntries(relation.references.map((field, i) => [field, values[i]]))
        const found = await targetDelegate.findUnique({ where })
        if (!found) {
          failures.push(`${model.name}.${relation.fields.join(',')}: orphan reference to ${relation.target} (${key})`)
          break
        }
      }
    }
  }
} finally {
  await db.$disconnect()
}

if (failures.length) {
  console.error(`[migration-validate] FAILED with ${failures.length} issue(s)`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('[migration-validate] PASS: all model counts/checksums and relation references match')
