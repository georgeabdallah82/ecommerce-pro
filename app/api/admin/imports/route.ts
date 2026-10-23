import { routeError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { runInBackground } from '@/lib/background'
import { sendBackInStockAlerts } from '@/lib/back-in-stock'
import {
  COLLECTION_COLUMNS, PRODUCT_COLUMNS, parseCsv, parseVariantOptions, planCollectionImport, planProductImport, readImportOptions, readRows, slugify, summarize,
  type CatalogLookup, type CollectionKey, type ExistingCollection, type ImportOptions, type ParsedFile, type PlanEntry, type ProductKey, type StockState,
} from '@/lib/catalog-csv'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500

// Products › Import and Collections › Import (components/spreadsheet-import.tsx). Always two steps:
// mode=preview reads the file and answers the plan (what every row would do, lib/catalog-csv.ts);
// mode=apply reads the same file again, makes the same plan here (never trusting the browser's) and
// saves it only if no row has a problem, all in one transaction.
export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'products'
    const mode = url.searchParams.get('mode') || 'preview'
    if (!['products', 'collections'].includes(type)) return NextResponse.json({ error: 'Unsupported import type' }, { status: 400 })
    if (!['preview', 'apply'].includes(mode)) return NextResponse.json({ error: 'Unsupported import mode' }, { status: 400 })
    const actor = await requirePermission(type === 'collections' ? 'collections.manage' : 'products.manage')
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a CSV file first.' }, { status: 400 })
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'The file is bigger than 2 MB. Split it into smaller files.' }, { status: 413 })
    let rows
    try { rows = parseCsv(await file.text()) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'This file could not be read as CSV.' }, { status: 400 }) }
    if (!rows.length) return NextResponse.json({ error: 'The file has no rows under the column names.' }, { status: 400 })
    if (rows.length > MAX_ROWS) return NextResponse.json({ error: `The file has ${rows.length} rows; the most is ${MAX_ROWS} per import. Split it into smaller files.` }, { status: 413 })
    const options = readImportOptions(form)

    if (type === 'products') {
      const parsed = readRows(rows, PRODUCT_COLUMNS)
      if (!parsed.columns.has('sku')) return NextResponse.json({ error: 'The file needs a "SKU" column: it is how each row finds its product.' }, { status: 400 })
      const lookup = await loadCatalog(parsed)
      const plan = planProductImport(parsed, lookup, options)
      const summary = summarize(plan)
      if (mode === 'preview') return NextResponse.json({ plan, summary, ignored: parsed.ignored, backupSkus: plan.filter(p => p.kind === 'product' && p.action === 'update').map(p => p.sku) })
      if (summary.error) return NextResponse.json({ error: 'Some rows have problems. Fix them in the file and upload it again.', plan, summary }, { status: 422 })
      const result = await applyProducts(parsed, plan, lookup, options)
      await audit(actor.id, 'ADMIN_IMPORT', 'products', undefined, { filename: file.name, rowCount: rows.length, ...result.counts, options })
      if (result.touchedProductIds.length) runInBackground(sendBackInStockAlerts(result.touchedProductIds).catch(error => console.error('[back-in-stock] alerts after import failed', error)))
      return NextResponse.json({ ok: true, ...result.counts, summary })
    }

    const parsed = readRows(rows, COLLECTION_COLUMNS)
    if (!parsed.columns.has('name') && !parsed.columns.has('slug')) return NextResponse.json({ error: 'The file needs a "Name" or "URL handle" column.' }, { status: 400 })
    const { existing, knownSkus } = await loadCollections(parsed)
    const plan = planCollectionImport(parsed, existing, knownSkus, options)
    const summary = summarize(plan)
    if (mode === 'preview') return NextResponse.json({ plan, summary, ignored: parsed.ignored, backupSkus: [] })
    if (summary.error) return NextResponse.json({ error: 'Some rows have problems. Fix them in the file and upload it again.', plan, summary }, { status: 422 })
    const counts = await applyCollections(parsed, plan, existing)
    await audit(actor.id, 'ADMIN_IMPORT', 'collections', undefined, { filename: file.name, rowCount: rows.length, ...counts, options })
    return NextResponse.json({ ok: true, ...counts, summary })
  } catch (error) { return routeError(error, 'Import failed', 400) }
}

const stockOf = (rows: Array<{ quantity: number; reserved: number }>): StockState => ({ rows: rows.length, quantity: rows.reduce((s, r) => s + r.quantity, 0), reserved: rows.reduce((s, r) => s + r.reserved, 0) })

// Everything the plan compares against, for just the SKUs, handles and barcodes in the file.
async function loadCatalog(parsed: ParsedFile<ProductKey>): Promise<CatalogLookup> {
  const productRows = parsed.rows.filter(r => !r.values.variantOf)
  const variantRows = parsed.rows.filter(r => r.values.variantOf)
  const skus = [...new Set([...productRows.map(r => String(r.values.sku || '')), ...variantRows.map(r => String(r.values.variantOf))].filter(Boolean))]
  const variantSkus = [...new Set(variantRows.map(r => String(r.values.variantSku || '')).filter(Boolean))]
  const slugs = [...new Set(productRows.map(r => slugify(String(r.values.slug || r.values.name || r.values.sku || ''))).filter(Boolean))]
  const barcodes = [...new Set(productRows.map(r => String(r.values.barcode || '')).filter(Boolean))]
  const variantBarcodes = [...new Set(variantRows.map(r => String(r.values.variantBarcode || '')).filter(Boolean))]
  const [products, slugOwners, barcodeOwners, variants, variantBarcodeOwners, collections] = await Promise.all([
    skus.length ? db.product.findMany({ where: { sku: { in: skus } }, include: { tags: true, collections: { select: { collectionId: true } }, inventory: { where: { variantId: null } } } }) : [],
    slugs.length ? db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, sku: true } }) : [],
    barcodes.length ? db.product.findMany({ where: { barcode: { in: barcodes } }, select: { barcode: true, sku: true } }) : [],
    variantSkus.length ? db.productVariant.findMany({ where: { sku: { in: variantSkus } }, include: { product: { select: { sku: true } }, inventory: true } }) : [],
    variantBarcodes.length ? db.productVariant.findMany({ where: { barcode: { in: variantBarcodes } }, select: { barcode: true, sku: true } }) : [],
    db.collection.findMany({ select: { id: true, name: true, slug: true } }),
  ])
  return {
    products: new Map(products.map(p => [p.sku, {
      id: p.id, sku: p.sku, name: p.name, slug: p.slug, status: p.status, basePrice: p.basePrice, compareAtPrice: p.compareAtPrice, costPrice: p.costPrice,
      description: p.description, shortDescription: p.shortDescription, brand: p.brand, vendor: p.vendor, productType: p.productType, barcode: p.barcode,
      featured: p.featured, trackInventory: p.trackInventory, continueSellingWhenOutOfStock: p.continueSellingWhenOutOfStock, requiresShipping: p.requiresShipping,
      taxable: p.taxable, giftCard: p.giftCard, weight: p.weight, weightUnit: p.weightUnit, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImageUrl: p.seoImageUrl,
      tags: p.tags.map(t => t.value), collectionIds: p.collections.map(c => c.collectionId), stock: stockOf(p.inventory), lowStockThreshold: p.inventory.length === 1 ? p.inventory[0].lowStockThreshold : null,
    }])),
    variants: new Map(variants.map(v => [v.sku, { id: v.id, sku: v.sku, productSku: v.product.sku, name: v.name, barcode: v.barcode, optionJson: v.optionJson, price: v.price, compareAtPrice: v.compareAtPrice, stock: stockOf(v.inventory), lowStockThreshold: v.inventory.length === 1 ? v.inventory[0].lowStockThreshold : null }])),
    slugOwner: new Map(slugOwners.map(p => [p.slug, p.sku])),
    barcodeOwner: new Map(barcodeOwners.filter(p => p.barcode).map(p => [p.barcode!, p.sku])),
    variantBarcodeOwner: new Map(variantBarcodeOwners.filter(v => v.barcode).map(v => [v.barcode!, v.sku])),
    collections,
  }
}

const PRODUCT_FIELDS = ['name', 'description', 'shortDescription', 'brand', 'vendor', 'productType', 'basePrice', 'compareAtPrice', 'costPrice', 'barcode', 'status', 'featured', 'seoTitle', 'seoDescription', 'seoImageUrl', 'weight', 'weightUnit', 'requiresShipping', 'taxable', 'trackInventory', 'continueSellingWhenOutOfStock', 'giftCard'] as const

async function applyProducts(parsed: ParsedFile<ProductKey>, plan: PlanEntry[], lookup: CatalogLookup, options: ImportOptions) {
  const byLine = new Map(parsed.rows.map(r => [r.line, r.values]))
  const collectionId = (name: string) => lookup.collections.find(c => c.slug.toLowerCase() === name.toLowerCase() || c.name.toLowerCase() === name.toLowerCase())!.id
  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 }
  const touchedProductIds: string[] = []
  const reason = 'Spreadsheet import'

  // Sets one stock row (or makes the first), with a movement in the stock history.
  async function setStock(tx: any, productId: string, variantId: string | null, quantity: number) {
    const rows = await tx.inventoryItem.findMany({ where: { productId, variantId } })
    if (rows.length > 1) return
    if (!rows.length) { const created = await tx.inventoryItem.create({ data: { productId, variantId, quantity, reserved: 0 } }); if (quantity) await tx.inventoryMovement.create({ data: { inventoryId: created.id, type: 'ADJUSTMENT', quantity, reason } }); return }
    const delta = quantity - rows[0].quantity
    if (!delta) return
    await tx.inventoryItem.update({ where: { id: rows[0].id }, data: { quantity } })
    await tx.inventoryMovement.create({ data: { inventoryId: rows[0].id, type: 'ADJUSTMENT', quantity: delta, reason } })
  }

  await db.$transaction(async tx => {
    const productIdBySku = new Map([...lookup.products.values()].map(p => [p.sku, p.id]))
    for (const entry of plan.filter(p => p.kind === 'product')) {
      if (entry.action === 'unchanged') { counts.unchanged++; continue }
      if (entry.action === 'skip') { counts.skipped++; continue }
      const v = byLine.get(entry.line)!
      const data: Record<string, unknown> = {}
      for (const key of PRODUCT_FIELDS) if (v[key] !== undefined) data[key] = v[key]
      if (entry.action === 'create') {
        const product = await tx.product.create({ data: {
          sku: entry.sku, name: String(v.name), slug: slugify(String(v.slug || v.name || entry.sku)), basePrice: 0, ...data,
          status: options.newAsDraft ? 'DRAFT' : (v.status as any) || 'DRAFT',
        } as any })
        productIdBySku.set(entry.sku, product.id)
        await tx.inventoryItem.create({ data: { productId: product.id, variantId: null, quantity: (v.quantity as number) ?? 0, reserved: 0, lowStockThreshold: (v.lowStockThreshold as number) ?? 5 } })
        if (v.tags) await tx.productTag.createMany({ data: [...new Set(v.tags as string[])].map(value => ({ productId: product.id, value })) })
        if (v.collections) for (const [i, name] of [...new Set(v.collections as string[])].entries()) await tx.collectionProduct.create({ data: { collectionId: collectionId(name), productId: product.id, sortOrder: i } })
        counts.created++
        continue
      }
      // update: only what the plan listed (columns in the file, filled in, and different).
      const existing = lookup.products.get(entry.sku)!
      if (v.slug !== undefined) data.slug = slugify(String(v.slug))
      if (Object.keys(data).length) await tx.product.update({ where: { id: existing.id }, data: data as any })
      if (v.tags !== undefined) { await tx.productTag.deleteMany({ where: { productId: existing.id } }); await tx.productTag.createMany({ data: [...new Set(v.tags as string[])].map(value => ({ productId: existing.id, value })) }) }
      if (v.collections !== undefined) {
        const ids = [...new Set((v.collections as string[]).map(collectionId))]
        await tx.collectionProduct.deleteMany({ where: { productId: existing.id, collectionId: { notIn: ids } } })
        for (const id of ids) if (!existing.collectionIds.includes(id)) await tx.collectionProduct.create({ data: { collectionId: id, productId: existing.id } })
      }
      if (entry.changes.some(c => c.label === 'Stock')) await setStock(tx, existing.id, null, v.quantity as number)
      if (entry.changes.some(c => c.label === 'Low stock at')) await tx.inventoryItem.updateMany({ where: { productId: existing.id, variantId: null }, data: { lowStockThreshold: v.lowStockThreshold as number } })
      touchedProductIds.push(existing.id)
      counts.updated++
    }

    for (const entry of plan.filter(p => p.kind === 'variant')) {
      if (entry.action === 'unchanged') { counts.unchanged++; continue }
      if (entry.action === 'skip') { counts.skipped++; continue }
      const v = byLine.get(entry.line)!
      const productId = productIdBySku.get(String(v.variantOf))!
      const data: Record<string, unknown> = {}
      if (v.variantName !== undefined) data.name = v.variantName
      if (v.variantBarcode !== undefined) data.barcode = v.variantBarcode
      if (v.variantOptions !== undefined) data.optionJson = JSON.stringify(parseVariantOptions(String(v.variantOptions)))
      if (v.variantPrice !== undefined) data.price = v.variantPrice
      if (v.variantCompareAtPrice !== undefined) data.compareAtPrice = v.variantCompareAtPrice
      if (entry.action === 'create') {
        const variant = await tx.productVariant.create({ data: { productId, sku: entry.sku, name: String(v.variantName || entry.sku), optionJson: '{}', ...data } as any })
        await tx.inventoryItem.create({ data: { productId, variantId: variant.id, quantity: (v.variantQuantity as number) ?? 0, reserved: 0, lowStockThreshold: (v.variantLowStockThreshold as number) ?? 5 } })
        counts.created++
        continue
      }
      const existing = lookup.variants.get(entry.sku)!
      if (Object.keys(data).length) await tx.productVariant.update({ where: { id: existing.id }, data: data as any })
      if (entry.changes.some(c => c.label === 'Option stock')) await setStock(tx, productId, existing.id, v.variantQuantity as number)
      touchedProductIds.push(productId)
      counts.updated++
    }
  }, { timeout: 60_000, maxWait: 10_000 })
  return { counts, touchedProductIds: [...new Set(touchedProductIds)] }
}

async function loadCollections(parsed: ParsedFile<CollectionKey>) {
  const slugs = [...new Set(parsed.rows.map(r => slugify(String(r.values.slug || r.values.name || ''))).filter(Boolean))]
  const skus = [...new Set(parsed.rows.flatMap(r => (r.values.productSkus as string[] | undefined) || []))]
  const [collections, products] = await Promise.all([
    slugs.length ? db.collection.findMany({ where: { slug: { in: slugs } }, include: { products: { include: { product: { select: { sku: true } } }, orderBy: { sortOrder: 'asc' } } } }) : [],
    skus.length ? db.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } }) : [],
  ])
  const existing = new Map<string, ExistingCollection>(collections.map(c => [c.slug, { id: c.id, name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl, isActive: c.isActive, sortOrder: c.sortOrder, productSkus: c.products.map(p => p.product.sku) }]))
  return { existing, knownSkus: new Set(products.map(p => p.sku)) }
}

async function applyCollections(parsed: ParsedFile<CollectionKey>, plan: PlanEntry[], existing: Map<string, ExistingCollection>) {
  const byLine = new Map(parsed.rows.map(r => [r.line, r.values]))
  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 }
  await db.$transaction(async tx => {
    for (const entry of plan) {
      if (entry.action === 'unchanged') { counts.unchanged++; continue }
      if (entry.action === 'skip') { counts.skipped++; continue }
      const v = byLine.get(entry.line)!
      const data: Record<string, unknown> = {}
      for (const key of ['name', 'description', 'imageUrl', 'isActive', 'sortOrder'] as const) if (v[key] !== undefined) data[key] = v[key]
      const collection = entry.action === 'create'
        ? await tx.collection.create({ data: { name: String(v.name), slug: entry.sku, ...data } as any })
        : Object.keys(data).length ? await tx.collection.update({ where: { id: existing.get(entry.sku)!.id }, data: data as any }) : { id: existing.get(entry.sku)!.id }
      if (v.productSkus !== undefined) {
        const products = await tx.product.findMany({ where: { sku: { in: v.productSkus as string[] } }, select: { id: true, sku: true } })
        const idBySku = new Map(products.map(p => [p.sku, p.id]))
        await tx.collectionProduct.deleteMany({ where: { collectionId: collection.id } })
        for (const [i, sku] of [...new Set(v.productSkus as string[])].entries()) { const productId = idBySku.get(sku); if (productId) await tx.collectionProduct.create({ data: { collectionId: collection.id, productId, sortOrder: i } }) }
      }
      if (entry.action === 'create') counts.created++
      else counts.updated++
    }
  }, { timeout: 60_000, maxWait: 10_000 })
  return counts
}
