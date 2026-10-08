// Copies the store from MongoDB (the Prisma Accelerate era) into PostgreSQL (Neon) and proves the
// copy is exact. Run by .github/workflows/postgres-migration.yml; MongoDB is only read.
//
//   node scripts/migrate-mongodb-to-postgres.mjs --mode rehearsal|final
//
// Env: MONGODB_URL (source), TARGET_DATABASE_URL (PostgreSQL, a direct -- not pooled -- address),
//      E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (rehearsal only: a throwaway staff login for the e2e test).
//
// What it does:
// 1. Refuses to touch a target that already holds live data: anything it did not write itself,
//    or orders placed after the last copy (the store is already running on PostgreSQL).
// 2. Empties the target, then copies every model parent-first (prisma/schema.prisma relations).
// 3. Rows PostgreSQL would reject but MongoDB accepted are reported, never silently dropped:
//    a reference to a missing record (an optional one is cleared, a required one skips the row)
//    and duplicates of a unique key MongoDB did not enforce.
// 4. Reads everything back and compares row counts and a SHA-256 fingerprint of every table.
// 5. Rehearsal only: switches off the ad pixels, Meta Conversions API and outgoing webhooks in
//    the copy (an e2e test runs against it) and adds the throwaway staff login. The final copy
//    is untouched.
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'

const root = process.cwd()
const modeArg = process.argv.indexOf('--mode')
const mode = modeArg > -1 ? process.argv[modeArg + 1] : ''
if (!['rehearsal', 'final'].includes(mode)) throw new Error('Usage: --mode rehearsal|final')
const MONGODB_URL = process.env.MONGODB_URL || ''
const TARGET_URL = process.env.TARGET_DATABASE_URL || ''
if (!/^mongodb(\+srv)?:\/\//.test(MONGODB_URL)) throw new Error('MONGODB_URL must be a mongodb:// connection string')
if (!/^postgres(ql)?:\/\//.test(TARGET_URL)) throw new Error('TARGET_DATABASE_URL must be a postgresql:// connection string')

const tmp = resolve(root, '.migration-tmp')
const MARKER_KEY = 'migration.mongodbCopy'
const COMPOSITE_ID_MODELS = new Set(['CollectionProduct', 'CustomerTagMember', 'CustomerSegmentMember'])
const SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'])

// ---- Schema ------------------------------------------------------------------------------------
async function loadSchema() {
  const text = `${await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8')}\n${await readFile(resolve(root, 'prisma/models/shopify-parity.prisma'), 'utf8')}`
  const enums = new Set([...text.matchAll(/^enum\s+(\w+)\s*\{/gm)].map(m => m[1]))
  const blocks = [...text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm)].map(m => ({ name: m[1], body: m[2] }))
  const names = new Set(blocks.map(b => b.name))
  return blocks.map(({ name, body }) => {
    const scalars = new Map()
    const relations = []
    const uniques = []
    let compositeId = null
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim()
      if (!line) continue
      const block = line.match(/^@@(id|unique)\(\[([^\]]+)\]/)
      if (block) {
        const fields = block[2].split(',').map(f => f.trim())
        if (block[1] === 'id') compositeId = fields
        uniques.push(fields)
        continue
      }
      const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/)
      if (!f) continue
      const [, field, type, list, optional, rest] = f
      if (names.has(type)) {
        const rel = rest.match(/fields:\s*\[([^\]]+)\]\s*,\s*references:\s*\[([^\]]+)\]/)
        if (rel) relations.push({ parent: type, fields: rel[1].split(',').map(s => s.trim()), references: rel[2].split(',').map(s => s.trim()) })
        continue
      }
      if (!SCALARS.has(type) && !enums.has(type)) continue
      scalars.set(field, { type, optional: !!optional, list: !!list })
      if (/@unique\b/.test(rest)) uniques.push([field])
      if (/@id\b/.test(rest)) uniques.push([field])
    }
    return { name, delegate: name[0].toLowerCase() + name.slice(1), scalars, relations, uniques, compositeId }
  })
}

function parentFirst(models) {
  const deps = new Map(models.map(m => [m.name, new Set(m.relations.map(r => r.parent).filter(p => p !== m.name))]))
  const ordered = []
  while (deps.size) {
    const ready = [...deps].filter(([, d]) => d.size === 0).map(([n]) => n)
    if (!ready.length) throw new Error(`Relation cycle between: ${[...deps.keys()].join(', ')}`)
    for (const n of ready) { deps.delete(n); ordered.push(models.find(m => m.name === n)); for (const d of deps.values()) d.delete(n) }
  }
  return ordered
}

// ---- Clients -----------------------------------------------------------------------------------
// Both clients are generated here, from the checked-in schemas, into their own folders, so this
// works whatever the app's own @prisma/client was generated for.
function prisma(args) {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...args], { stdio: 'inherit', env: process.env })
}
async function generateClients() {
  await rm(tmp, { recursive: true, force: true })
  execFileSync(process.execPath, [resolve(root, 'scripts/prepare-mongodb-schema.mjs')], { stdio: 'inherit' })
  const setOutput = (schema, out) => schema
    .replace(/generator client \{[\s\S]*?\n\}/, `generator client {\n  provider = "prisma-client-js"\n  output   = "${out}"\n}`)
    .replace('url      = env("DATABASE_URL")', 'url      = env("MIGRATION_UNUSED_URL")')
  for (const [name, schemaDir] of [['mongodb', 'prisma-mongodb'], ['postgres', 'prisma']]) {
    const dir = resolve(tmp, name)
    await mkdir(resolve(dir, 'models'), { recursive: true })
    await writeFile(resolve(dir, 'schema.prisma'), setOutput(await readFile(resolve(root, schemaDir, 'schema.prisma'), 'utf8'), resolve(tmp, `${name}-client`)))
    await writeFile(resolve(dir, 'models/shopify-parity.prisma'), await readFile(resolve(root, schemaDir, 'models/shopify-parity.prisma'), 'utf8'))
    prisma(['generate', '--schema', dir])
  }
  const { PrismaClient: Mongo } = await import(resolve(tmp, 'mongodb-client/index.js'))
  const { PrismaClient: Postgres } = await import(resolve(tmp, 'postgres-client/index.js'))
  return {
    source: new Mongo({ datasources: { db: { url: MONGODB_URL } } }),
    target: new Postgres({ datasources: { db: { url: TARGET_URL } } }),
  }
}

// ---- Helpers -----------------------------------------------------------------------------------
const keyOf = (row, fields) => fields.map(f => row[f]).some(v => v === null || v === undefined) ? null : JSON.stringify(fields.map(f => row[f] instanceof Date ? row[f].toISOString() : row[f]))
function canonical(row, model) {
  const out = {}
  for (const field of [...model.scalars.keys()].sort()) {
    const v = row[field]
    out[field] = v instanceof Date ? v.toISOString() : v === undefined ? null : v
  }
  return JSON.stringify(out)
}
function orderBy(model) {
  return (model.compositeId || ['id']).map(f => ({ [f]: 'asc' }))
}
function fingerprint(rows, model) {
  const hash = createHash('sha256')
  for (const line of rows.map(r => canonical(r, model)).sort()) hash.update(line + '\n')
  return hash.digest('hex')
}
async function readAll(client, model) {
  const rows = []
  for (let skip = 0; ; skip += 1000) {
    const page = await client[model.delegate].findMany({ orderBy: orderBy(model), skip, take: 1000 })
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

// ---- Safety ------------------------------------------------------------------------------------
async function guardTarget(target, models) {
  const counts = await Promise.all(models.map(m => target[m.delegate].count()))
  if (counts.every(c => c === 0)) return
  const marker = await target.setting.findUnique({ where: { key: MARKER_KEY } })
  if (!marker) throw new Error('The PostgreSQL database already holds data this tool did not write. Refusing to replace it.')
  const info = JSON.parse(marker.value)
  if (info.mode === 'final') {
    // After the final copy only a repeat of the final copy may replace it, and only while nothing
    // has happened on PostgreSQL since: no order and no admin action (the store went live).
    if (mode !== 'final') throw new Error('The final copy is already in place; rehearsals are over. Refusing to replace it.')
    const since = { gt: new Date(info.copiedAt) }
    const [newOrders, newActions] = await Promise.all([target.order.count({ where: { createdAt: since } }), target.auditLog.count({ where: { createdAt: since } })])
    if (newOrders || newActions) throw new Error(`PostgreSQL has ${newOrders} order(s) and ${newActions} admin action(s) after the final copy -- the store is running on it. Refusing to replace it.`)
  }
  console.log(`[copy] replacing the previous ${info.mode} copy from ${info.copiedAt}`)
}
async function assertMaintenanceOn(source) {
  const setting = await source.setting.findUnique({ where: { key: 'maintenance.enabled' } })
  if (setting?.value !== 'true') throw new Error('Final copy: turn on maintenance mode first (Admin > Settings) so no order is placed on MongoDB during the switch.')
}

// ---- Main --------------------------------------------------------------------------------------
const models = parentFirst(await loadSchema())
const { source, target } = await generateClients()
const report = { mode, startedAt: new Date().toISOString(), models: {}, nullified: [], skipped: [], duplicates: [] }
let failed = false
try {
  if (mode === 'final') await assertMaintenanceOn(source)
  await guardTarget(target, models)
  const tables = models.map(m => `"${m.name}"`).join(', ')
  await target.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`)

  const keyValues = new Map() // `${Model}.${field}` -> Set of values present in the copy
  const referenced = new Map(models.map(m => [m.name, new Set()]))
  for (const m of models) for (const r of m.relations) for (const f of r.references) referenced.get(r.parent).add(f)

  const expected = new Map()
  for (const model of models) {
    const rows = await readAll(source, model)
    const kept = []
    const seen = model.uniques.map(() => new Set())
    rowLoop: for (const original of rows) {
      const row = {}
      for (const field of model.scalars.keys()) row[field] = original[field] === undefined ? null : original[field]
      for (const field of ['barcode']) if (model.scalars.has(field) && typeof row[field] === 'string' && !row[field].trim()) row[field] = null
      for (const rel of model.relations) {
        const values = rel.fields.map(f => row[f])
        if (values.some(v => v === null)) continue
        const present = rel.references.every((ref, i) => keyValues.get(`${rel.parent}.${ref}`)?.has(values[i]))
        if (present) continue
        const optional = rel.fields.every(f => model.scalars.get(f)?.optional)
        const id = original.id ?? keyOf(original, model.compositeId || [])
        if (optional) { for (const f of rel.fields) row[f] = null; report.nullified.push(`${model.name} ${id}: ${rel.fields.join('+')} pointed to a missing ${rel.parent} -- cleared`) }
        else { report.skipped.push(`${model.name} ${id}: ${rel.fields.join('+')} points to a missing ${rel.parent} -- not copied`); continue rowLoop }
      }
      for (let i = 0; i < model.uniques.length; i++) {
        const key = keyOf(row, model.uniques[i])
        if (key === null) continue
        if (seen[i].has(key)) { report.duplicates.push(`${model.name} ${original.id ?? key}: duplicate ${model.uniques[i].join('+')} ${key} -- not copied`); continue rowLoop }
        seen[i].add(key)
      }
      kept.push(row)
    }
    for (let i = 0; i < kept.length; i += 200) await target[model.delegate].createMany({ data: kept.slice(i, i + 200) })
    for (const field of referenced.get(model.name)) keyValues.set(`${model.name}.${field}`, new Set(kept.map(r => r[field])))
    expected.set(model.name, kept)
    report.models[model.name] = { source: rows.length, copied: kept.length }
    console.log(`[copy] ${model.name}: ${kept.length}/${rows.length}`)
  }

  // Verify: every table read back and fingerprinted.
  for (const model of models) {
    const back = await readAll(target, model)
    const want = expected.get(model.name)
    const ok = back.length === want.length && fingerprint(back, model) === fingerprint(want, model)
    report.models[model.name].verified = ok
    if (!ok) { failed = true; console.error(`[verify] ${model.name}: MISMATCH (${back.length} rows back, ${want.length} expected)`) }
  }
  const sum = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0)
  const orders = expected.get('Order') || []
  report.totals = {
    orders: orders.length,
    ordersNotCancelledGrandTotal: sum(orders.filter(o => o.status !== 'CANCELLED'), 'grandTotal'),
    customers: (expected.get('User') || []).filter(u => u.role === 'CUSTOMER').length,
    products: (expected.get('Product') || []).length,
    stockOnHand: sum(expected.get('InventoryItem') || [], 'quantity'),
    walletTotal: sum(expected.get('WalletTransaction') || [], 'amount'),
    coinTotal: sum(expected.get('CoinTransaction') || [], 'amount'),
    giftCardBalance: sum(expected.get('GiftCard') || [], 'balance'),
  }

  if (mode === 'rehearsal' && !failed) {
    // The e2e test runs against this copy: nothing it does may reach customers, Meta or the
    // merchant's integrations.
    for (const key of ['tracking.metaPixelId', 'tracking.gaMeasurementId', 'tracking.tiktokPixelId', 'tracking.metaCapiToken']) {
      await target.setting.updateMany({ where: { key }, data: { value: '' } })
    }
    await target.webhookEndpoint.updateMany({ data: { status: 'DISABLED' } })
    const email = process.env.E2E_ADMIN_EMAIL, password = process.env.E2E_ADMIN_PASSWORD
    if (email && password) {
      const passwordHash = await bcrypt.hash(password, 10)
      await target.user.upsert({ where: { email }, update: { passwordHash, role: 'ADMIN', isActive: true }, create: { email, name: 'Rehearsal test', passwordHash, role: 'ADMIN' } })
    }
    // An active product with stock, for the e2e checkout.
    const stock = new Map()
    for (const item of expected.get('InventoryItem') || []) stock.set(item.productId, (stock.get(item.productId) || 0) + item.quantity - (item.reserved || 0))
    const buyable = (expected.get('Product') || []).filter(p => p.status === 'ACTIVE' && (stock.get(p.id) || 0) > 0)
    await writeFile(resolve(tmp, 'e2e.json'), JSON.stringify({ productPath: buyable[0] ? `/product/${buyable[0].slug}` : '' }))
  }
  if (!failed) {
    await target.setting.upsert({
      where: { key: MARKER_KEY },
      update: { value: JSON.stringify({ mode, copiedAt: new Date().toISOString(), run: randomUUID() }) },
      create: { key: MARKER_KEY, value: JSON.stringify({ mode, copiedAt: new Date().toISOString(), run: randomUUID() }) },
    })
  }
} finally {
  await source.$disconnect().catch(() => {})
  await target.$disconnect().catch(() => {})
}

report.finishedAt = new Date().toISOString()
report.result = failed ? 'FAILED' : 'OK'
console.log('\n===== MongoDB -> PostgreSQL copy report =====')
console.log(JSON.stringify({ ...report, nullified: report.nullified.length, skipped: report.skipped.length, duplicates: report.duplicates.length }, null, 2))
for (const [title, list] of [['Cleared references', report.nullified], ['Rows not copied (missing parent)', report.skipped], ['Rows not copied (duplicate key)', report.duplicates]]) {
  if (list.length) { console.log(`\n${title}:`); for (const line of list.slice(0, 200)) console.log('  ' + line) }
}
if (failed) process.exit(1)
