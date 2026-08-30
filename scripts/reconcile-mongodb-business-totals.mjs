import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rawTargetUrl = process.env.TARGET_DATABASE_URL?.trim()
if (!rawTargetUrl) throw new Error('TARGET_DATABASE_URL is required')

const tmpRoot = resolve(process.cwd(), '.migration-tmp')
const exportRoot = resolve(tmpRoot, 'export')

const specs = {
  User: { count: true },
  Product: { count: true, sum: ['basePrice', 'costPrice', 'compareAtPrice'] },
  ProductVariant: { count: true, sum: ['price', 'compareAtPrice'] },
  InventoryItem: { count: true, sum: ['quantity', 'reserved'] },
  Order: { count: true, sum: ['subtotal', 'discountTotal', 'shippingTotal', 'taxTotal', 'grandTotal'] },
  OrderItem: { count: true, sum: ['quantity', 'unitPrice', 'totalPrice'] },
  PaymentTransaction: { count: true, sum: ['amount'] },
  Coupon: { count: true, sum: ['usedCount'] },
  Review: { count: true, sum: ['rating'] },
}

function delegateName(name) { return name[0].toLowerCase() + name.slice(1) }

async function sourceTotals(model, spec) {
  const text = await readFile(resolve(exportRoot, `${model}.ndjson`), 'utf8').catch(() => '')
  const totals = { count: 0 }
  for (const field of spec.sum ?? []) totals[field] = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    totals.count += 1
    for (const field of spec.sum ?? []) {
      const value = row[field]
      if (typeof value === 'number' && Number.isFinite(value)) totals[field] += value
    }
  }
  return totals
}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: rawTargetUrl } } })
const failures = []

try {
  for (const [model, spec] of Object.entries(specs)) {
    const source = await sourceTotals(model, spec)
    const delegate = db[delegateName(model)]
    if (!delegate?.aggregate) {
      failures.push(`${model}: missing Prisma aggregate delegate`)
      continue
    }
    const sumFields = Object.fromEntries((spec.sum ?? []).map(field => [field, true]))
    const aggregate = await delegate.aggregate({
      _count: { _all: true },
      ...(Object.keys(sumFields).length ? { _sum: sumFields } : {}),
    })
    const target = { count: Number(aggregate?._count?._all ?? 0) }
    for (const field of spec.sum ?? []) target[field] = Number(aggregate?._sum?.[field] ?? 0)

    for (const key of Object.keys(source)) {
      if (source[key] !== target[key]) failures.push(`${model}.${key}: source ${source[key]} != target ${target[key]}`)
    }
    console.log(`[business-reconcile] ${model}: ${failures.some(f => f.startsWith(`${model}.`)) ? 'MISMATCH' : 'OK'}`)
  }
} finally {
  await db.$disconnect()
}

if (failures.length) {
  console.error(`[business-reconcile] FAILED with ${failures.length} mismatch(es)`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('[business-reconcile] PASS: critical ecommerce counts and monetary/inventory totals match the exported source snapshot')
