import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500
const PRODUCT_STATUSES = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED'])
type Row = Record<string, string>

function parseCsv(text: string): Row[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false; else cell += ch }
    else if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted field')
  if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  if (!rows.length) return []
  const headers = rows.shift()!.map(h => h.trim())
  if (!headers.length || headers.some(h => !h)) throw new Error('CSV header row is invalid')
  const duplicate = headers.find((h, i) => headers.indexOf(h) !== i)
  if (duplicate) throw new Error(`Duplicate CSV header: ${duplicate}`)
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}

// v is `undefined` whenever the CSV simply doesn't include that (optional) column at all --
// parseCsv only ever sets keys for headers actually present in the file -- as opposed to `''`
// for a column that's there but left blank on this row. Both mean "use the fallback."
const bool = (v: string | undefined, fallback = false) => !v ? fallback : ['true', '1', 'yes'].includes(v.toLowerCase())
const num = (v: string | undefined, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback }
const slugify = (v: string | undefined) => (v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
const cleanSlug = (v: string | undefined, fallback: string) => slugify(v) || slugify(fallback) || `item-${Date.now()}`
const split = (v?: string) => (v || '').split('|').map(x => x.trim()).filter(Boolean)
// "Color:Red|Size:M" -> {Color: "Red", Size: "M"}, matching how the manual admin product
// editor already stores variant options (JSON.stringify(v.options) in app/api/admin/products/route.ts).
const parseVariantOptions = (v?: string) => Object.fromEntries(split(v).map(pair => { const i = pair.indexOf(':'); return i === -1 ? [pair, ''] : [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] }))

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const url = new URL(request.url); const type = url.searchParams.get('type') || 'products'; const mode = url.searchParams.get('mode') || 'apply'
    if (!['products', 'categories', 'collections'].includes(type)) return NextResponse.json({ error: 'Unsupported import type' }, { status: 400 })
    if (!['preview', 'apply'].includes(mode)) return NextResponse.json({ error: 'Unsupported import mode' }, { status: 400 })
    const form = await request.formData(); const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'CSV file is required' }, { status: 400 })
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'CSV exceeds 2 MB limit' }, { status: 413 })
    const rows = parseCsv(await file.text())
    if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Maximum ${MAX_ROWS} rows per import` }, { status: 413 })

    const errors: string[] = []; const preview = rows.map((r, i) => ({ row: i + 2, action: 'validated', name: r.variantOf ? `${r.variantName || r.variantSku || ''} (variant)` : (r.name || ''), sku: r.variantOf ? (r.variantSku || '') : (r.sku || '') })); const addError = (m: string) => { if (errors.length < 100) errors.push(m) }
    if (type === 'products') {
      // A row with variantOf set is a variant of another row's product, not a standalone
      // product -- it's validated against ProductVariant's own required fields instead.
      const seen = new Set<string>(); const seenVariantSku = new Set<string>()
      rows.forEach((r, i) => {
        if (r.variantOf) {
          if (!r.variantSku) addError(`Row ${i + 2}: variantSku is required when variantOf is set`)
          if (r.variantSku && seenVariantSku.has(r.variantSku)) addError(`Row ${i + 2}: duplicate variantSku ${r.variantSku} in import`)
          if (r.variantSku) seenVariantSku.add(r.variantSku)
          if (r.variantPrice && !Number.isFinite(Number(r.variantPrice))) addError(`Row ${i + 2}: variantPrice must be numeric`)
          if (r.variantQuantity && !Number.isFinite(Number(r.variantQuantity))) addError(`Row ${i + 2}: variantQuantity must be numeric`)
          return
        }
        if (!r.sku || !r.name) addError(`Row ${i + 2}: sku and name are required`); if (r.sku && seen.has(r.sku)) addError(`Row ${i + 2}: duplicate SKU ${r.sku} in import`); if (r.sku) seen.add(r.sku); if (r.status && !PRODUCT_STATUSES.has(r.status)) addError(`Row ${i + 2}: invalid status ${r.status}`); if (r.basePrice && !Number.isFinite(Number(r.basePrice))) addError(`Row ${i + 2}: basePrice must be numeric`); if (r.quantity && !Number.isFinite(Number(r.quantity))) addError(`Row ${i + 2}: quantity must be numeric`)
      })
    } else rows.forEach((r, i) => { if (!r.name) addError(`Row ${i + 2}: name is required`) })
    if (mode === 'preview') return NextResponse.json({ ok: !errors.length, rows: preview, errors })
    if (errors.length) return NextResponse.json({ error: 'Import validation failed', errors }, { status: 422 })

    let created = 0, updated = 0
    await db.$transaction(async tx => {
      if (type === 'categories') {
        for (const r of rows) { const slug = cleanSlug(r.slug, r.name); const existing = await tx.category.findUnique({ where: { slug } }); const data = { name: r.name, slug, description: r.description || null, imageUrl: r.imageUrl || null, isActive: bool(r.isActive, true), sortOrder: num(r.sortOrder) }; if (existing) { await tx.category.update({ where: { id: existing.id }, data }); updated++ } else { await tx.category.create({ data }); created++ } }
        for (const r of rows) { const slug = cleanSlug(r.slug, r.name); const parentId = r.parentSlug ? (await tx.category.findUnique({ where: { slug: r.parentSlug } }))?.id || null : null; await tx.category.update({ where: { slug }, data: { parentId } }) }
      } else if (type === 'collections') {
        for (const r of rows) { const slug = cleanSlug(r.slug, r.name); const existing = await tx.collection.findUnique({ where: { slug } }); const data = { name: r.name, slug, description: r.description || null, imageUrl: r.imageUrl || null, isActive: bool(r.isActive, true), sortOrder: num(r.sortOrder) }; if (existing) { await tx.collection.update({ where: { id: existing.id }, data }); updated++ } else { await tx.collection.create({ data }); created++ } }
        for (const r of rows) { const collection = await tx.collection.findUnique({ where: { slug: cleanSlug(r.slug, r.name) } }); if (!collection) continue; await tx.collectionProduct.deleteMany({ where: { collectionId: collection.id } }); for (const sku of split(r.productSkus)) { const product = await tx.product.findUnique({ where: { sku } }); if (product) await tx.collectionProduct.create({ data: { collectionId: collection.id, productId: product.id } }) } }
      } else {
        // Rows with variantOf set are processed in a second pass below, once every row's own
        // product (this pass) is guaranteed to exist -- a variant can reference a product
        // defined earlier in the very same file.
        for (const r of rows) {
          if (r.variantOf) continue
          const existing = await tx.product.findUnique({ where: { sku: r.sku } }); const slug = cleanSlug(r.slug, r.name); const slugOwner = await tx.product.findUnique({ where: { slug } }); if (slugOwner && slugOwner.id !== existing?.id) throw new Error(`Slug already belongs to another product: ${slug}`)
          const barcode = r.barcode || null; if (barcode) { const barcodeOwner = await tx.product.findUnique({ where: { barcode } }); if (barcodeOwner && barcodeOwner.id !== existing?.id) throw new Error(`Barcode already belongs to another product: ${barcode}`) }
          const category = r.categorySlug ? await tx.category.findUnique({ where: { slug: r.categorySlug } }) : null
          const data = { name: r.name, slug, description: r.description || null, shortDescription: r.shortDescription || null, brand: r.brand || null, vendor: r.vendor || null, productType: r.productType || null, basePrice: num(r.basePrice), compareAtPrice: r.compareAtPrice ? num(r.compareAtPrice) : null, costPrice: r.costPrice ? num(r.costPrice) : null, barcode, status: (r.status || 'DRAFT') as 'DRAFT' | 'ACTIVE' | 'ARCHIVED', featured: bool(r.featured), seoTitle: r.seoTitle || null, seoDescription: r.seoDescription || null, seoImageUrl: r.seoImageUrl || null, weight: r.weight ? num(r.weight) : null, weightUnit: r.weightUnit || null, requiresShipping: bool(r.requiresShipping, true), taxable: bool(r.taxable, true), trackInventory: bool(r.trackInventory, true), continueSellingWhenOutOfStock: bool(r.continueSellingWhenOutOfStock), giftCard: bool(r.giftCard), categoryId: category?.id || null }
          let product; if (existing) { product = await tx.product.update({ where: { id: existing.id }, data }); updated++ } else { product = await tx.product.create({ data: { ...data, sku: r.sku } }); created++ }
          // Every product needs at least one InventoryItem row for its trackInventory-gated
          // availability checks (checkout, the storefront PDP) to see anything but 0 in
          // stock -- the manual admin "New product" flow always creates one (see
          // app/api/admin/products/route.ts), but CSV import skipped it entirely, silently
          // making every imported product unsellable until someone opened it in Inventory
          // and added stock by hand. Only backfills a *missing* row, so re-importing never
          // resets stock an admin already adjusted here.
          const hasInventoryRow = await tx.inventoryItem.findFirst({ where: { productId: product.id, variantId: null } })
          if (!hasInventoryRow) {
            await tx.inventoryItem.create({ data: { productId: product.id, variantId: null, quantity: r.quantity ? Math.max(0, Math.trunc(num(r.quantity))) : 0, reserved: 0, lowStockThreshold: r.lowStockThreshold ? Math.max(0, Math.trunc(num(r.lowStockThreshold))) : 5 } })
          }
          await tx.productTag.deleteMany({ where: { productId: product.id } }); const tags = split(r.tags); for (const value of tags) { const exists = await tx.productTag.findFirst({ where: { productId: product.id, value } }); if (!exists) await tx.productTag.create({ data: { productId: product.id, value } }) }
          await tx.collectionProduct.deleteMany({ where: { productId: product.id } }); for (const collectionSlug of split(r.collectionSlugs)) { const collection = await tx.collection.findUnique({ where: { slug: collectionSlug } }); if (collection) await tx.collectionProduct.create({ data: { collectionId: collection.id, productId: product.id } }) }
        }
        for (const r of rows) {
          if (!r.variantOf) continue
          const parent = await tx.product.findUnique({ where: { sku: r.variantOf } })
          if (!parent) throw new Error(`Variant ${r.variantSku} references unknown product SKU: ${r.variantOf}`)
          const existingVariant = await tx.productVariant.findUnique({ where: { sku: r.variantSku } })
          if (existingVariant && existingVariant.productId !== parent.id) throw new Error(`Variant SKU already belongs to a different product: ${r.variantSku}`)
          const variantBarcode = r.variantBarcode || null
          if (variantBarcode) { const barcodeOwner = await tx.productVariant.findUnique({ where: { barcode: variantBarcode } }); if (barcodeOwner && barcodeOwner.id !== existingVariant?.id) throw new Error(`Variant barcode already belongs to another variant: ${variantBarcode}`) }
          const variantData = { productId: parent.id, name: r.variantName || r.variantSku!, sku: r.variantSku!, barcode: variantBarcode, optionJson: JSON.stringify(parseVariantOptions(r.variantOptions)), price: r.variantPrice ? num(r.variantPrice) : null, compareAtPrice: r.variantCompareAtPrice ? num(r.variantCompareAtPrice) : null }
          let variant; if (existingVariant) { variant = await tx.productVariant.update({ where: { id: existingVariant.id }, data: variantData }); updated++ } else { variant = await tx.productVariant.create({ data: variantData }); created++ }
          // Mirrors the base-product backfill above: only creates a row when the variant has
          // none yet, so re-importing never resets stock an admin already adjusted by hand.
          const hasVariantInventoryRow = await tx.inventoryItem.findFirst({ where: { productId: parent.id, variantId: variant.id } })
          if (!hasVariantInventoryRow) {
            await tx.inventoryItem.create({ data: { productId: parent.id, variantId: variant.id, quantity: r.variantQuantity ? Math.max(0, Math.trunc(num(r.variantQuantity))) : 0, reserved: 0, lowStockThreshold: r.variantLowStockThreshold ? Math.max(0, Math.trunc(num(r.variantLowStockThreshold))) : 5 } })
          }
        }
      }
    })
    await db.auditLog.create({ data: { actorId: actor.id, action: 'ADMIN_IMPORT', entity: type, metadataJson: JSON.stringify({ filename: file.name, rowCount: rows.length, created, updated }) } })
    return NextResponse.json({ ok: true, created, updated, errors: [] })
  } catch (error) { const message = error instanceof Error ? error.message : 'Import failed'; const status = message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 400; return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 401 ? 'Unauthorized' : message }, { status }) }
}
