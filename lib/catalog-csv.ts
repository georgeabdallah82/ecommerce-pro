// Product and collection spreadsheets (CSV): Products › Import / Export and Collections › Import /
// Export. Pure functions, shared by app/api/admin/imports, app/api/admin/exports and the tests.
//
// The rules that keep an import under control:
// - Nothing is saved until the owner has seen the plan: every row says whether it adds a product,
//   changes one (and exactly what: "Price $40.00 → $45.00"), changes nothing, is skipped, or has a
//   problem. Any problem stops the whole import.
// - Updating only touches the columns that are in the file and filled in. A file with just SKU and
//   Price changes prices and nothing else; an empty cell never wipes a description, tags or
//   collections.
// - Prices are written as money ("45.00"). Files exported before this used cents under the
//   technical column names (basePrice …); those names still import, as cents.

export type CsvRow = Record<string, string>

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  // RegExp() from a string: a raw U+FEFF or euro sign in a regex literal would land in the Worker bundle
  // as is, which scripts/check-worker-charset.mjs refuses.
  const source = text.replace(BOM, '')
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (quoted) throw new Error('The file has a cell with an opening quote (") that is never closed.')
  if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  if (!rows.length) return []
  const headers = rows.shift()!.map(h => h.trim())
  if (!headers.length || headers.every(h => !h)) throw new Error('The first row of the file must have the column names.')
  const named = headers.filter(Boolean)
  const duplicate = named.find((h, i) => named.findIndex(x => x.toLowerCase() === h.toLowerCase()) !== i)
  if (duplicate) throw new Error(`The column "${duplicate}" appears twice.`)
  return rows
    .filter(r => r.some(v => v.trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']).filter(([h]) => h)))
}

// Excel and Google Sheets would run a cell starting with = + - @ as a formula: those get a '.
const esc = (value: unknown) => {
  const s = value == null ? '' : String(value)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
// With a byte-order mark so Excel opens accents and Arabic correctly.
export const toCsv = (headers: string[], rows: unknown[][]) => '\ufeff' + [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n') + '\r\n'

export const centsToMoney = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2))
export const yesNo = (value: boolean | null | undefined) => (value == null ? '' : value ? 'Yes' : 'No')
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' }
export const statusLabel = (status: string | null | undefined) => STATUS_LABEL[String(status)] || String(status || '')

// ---------------------------------------------------------------------------------------------
// Columns

type FieldType = 'text' | 'money' | 'cents' | 'int' | 'number' | 'bool' | 'status' | 'list'
type Column<K extends string> = { key: K; label: string; type: FieldType; aliases?: string[]; legacy?: string[]; legacyType?: FieldType }

export type ProductKey =
  | 'sku' | 'name' | 'status' | 'basePrice' | 'compareAtPrice' | 'costPrice' | 'quantity' | 'lowStockThreshold'
  | 'collections' | 'tags' | 'description' | 'shortDescription' | 'brand' | 'vendor' | 'productType' | 'barcode'
  | 'slug' | 'featured' | 'trackInventory' | 'continueSellingWhenOutOfStock' | 'requiresShipping' | 'taxable'
  | 'weight' | 'weightUnit' | 'seoTitle' | 'seoDescription' | 'seoImageUrl' | 'giftCard'
  | 'variantOf' | 'variantSku' | 'variantName' | 'variantOptions' | 'variantPrice' | 'variantCompareAtPrice'
  | 'variantQuantity' | 'variantLowStockThreshold' | 'variantBarcode'

// In the order the export writes them. `legacy` names are the old technical columns (prices in cents).
export const PRODUCT_COLUMNS: Column<ProductKey>[] = [
  { key: 'sku', label: 'SKU', type: 'text', legacy: ['sku'] },
  { key: 'name', label: 'Name', type: 'text', aliases: ['title', 'product name'], legacy: ['name'] },
  { key: 'status', label: 'Status', type: 'status', legacy: ['status'] },
  { key: 'basePrice', label: 'Price', type: 'money', legacy: ['basePrice'], legacyType: 'cents' },
  { key: 'compareAtPrice', label: 'Compare-at price', type: 'money', aliases: ['compare at price', 'old price'], legacy: ['compareAtPrice'], legacyType: 'cents' },
  { key: 'costPrice', label: 'Cost price', type: 'money', aliases: ['cost', 'cost per item'], legacy: ['costPrice'], legacyType: 'cents' },
  { key: 'quantity', label: 'Stock', type: 'int', aliases: ['quantity', 'inventory'], legacy: ['quantity'] },
  { key: 'lowStockThreshold', label: 'Low stock at', type: 'int', legacy: ['lowStockThreshold'] },
  { key: 'collections', label: 'Collections', type: 'list', legacy: ['collectionSlugs'] },
  { key: 'tags', label: 'Tags', type: 'list', legacy: ['tags'] },
  { key: 'description', label: 'Description', type: 'text', legacy: ['description'] },
  { key: 'shortDescription', label: 'Short description', type: 'text', legacy: ['shortDescription'] },
  { key: 'brand', label: 'Brand', type: 'text', legacy: ['brand'] },
  { key: 'vendor', label: 'Vendor', type: 'text', legacy: ['vendor'] },
  { key: 'productType', label: 'Type', type: 'text', aliases: ['product type'], legacy: ['productType'] },
  { key: 'barcode', label: 'Barcode', type: 'text', legacy: ['barcode'] },
  { key: 'slug', label: 'URL handle', type: 'text', aliases: ['handle'], legacy: ['slug'] },
  { key: 'featured', label: 'Featured', type: 'bool', legacy: ['featured'] },
  { key: 'trackInventory', label: 'Track stock', type: 'bool', legacy: ['trackInventory'] },
  { key: 'continueSellingWhenOutOfStock', label: 'Sell when out of stock', type: 'bool', legacy: ['continueSellingWhenOutOfStock'] },
  { key: 'requiresShipping', label: 'Requires shipping', type: 'bool', legacy: ['requiresShipping'] },
  { key: 'taxable', label: 'Taxable', type: 'bool', legacy: ['taxable'] },
  { key: 'weight', label: 'Weight', type: 'number', legacy: ['weight'] },
  { key: 'weightUnit', label: 'Weight unit', type: 'text', legacy: ['weightUnit'] },
  { key: 'seoTitle', label: 'SEO title', type: 'text', legacy: ['seoTitle'] },
  { key: 'seoDescription', label: 'SEO description', type: 'text', legacy: ['seoDescription'] },
  { key: 'seoImageUrl', label: 'SEO image', type: 'text', legacy: ['seoImageUrl'] },
  { key: 'giftCard', label: 'Gift card', type: 'bool', legacy: ['giftCard'] },
  { key: 'variantOf', label: 'Option of SKU', type: 'text', legacy: ['variantOf'] },
  { key: 'variantSku', label: 'Option SKU', type: 'text', legacy: ['variantSku'] },
  { key: 'variantName', label: 'Option name', type: 'text', legacy: ['variantName'] },
  { key: 'variantOptions', label: 'Option values', type: 'text', legacy: ['variantOptions'] },
  { key: 'variantPrice', label: 'Option price', type: 'money', legacy: ['variantPrice'], legacyType: 'cents' },
  { key: 'variantCompareAtPrice', label: 'Option compare-at price', type: 'money', legacy: ['variantCompareAtPrice'], legacyType: 'cents' },
  { key: 'variantQuantity', label: 'Option stock', type: 'int', legacy: ['variantQuantity'] },
  { key: 'variantLowStockThreshold', label: 'Option low stock at', type: 'int', legacy: ['variantLowStockThreshold'] },
  { key: 'variantBarcode', label: 'Option barcode', type: 'text', legacy: ['variantBarcode'] },
]

export type CollectionKey = 'name' | 'slug' | 'description' | 'imageUrl' | 'isActive' | 'sortOrder' | 'productSkus'
export const COLLECTION_COLUMNS: Column<CollectionKey>[] = [
  { key: 'name', label: 'Name', type: 'text', legacy: ['name'] },
  { key: 'slug', label: 'URL handle', type: 'text', aliases: ['handle'], legacy: ['slug'] },
  { key: 'isActive', label: 'Visible', type: 'bool', legacy: ['isActive'] },
  { key: 'sortOrder', label: 'Sort order', type: 'int', legacy: ['sortOrder'] },
  { key: 'productSkus', label: 'Product SKUs', type: 'list', aliases: ['products'], legacy: ['productSkus'] },
  { key: 'description', label: 'Description', type: 'text', legacy: ['description'] },
  { key: 'imageUrl', label: 'Image', type: 'text', aliases: ['image url'], legacy: ['imageUrl'] },
]

export type CellValue = string | number | boolean | string[]
export type ParsedRow<K extends string> = { line: number; values: Partial<Record<K, CellValue>>; errors: string[] }
export type ParsedFile<K extends string> = { rows: ParsedRow<K>[]; columns: Set<K>; ignored: string[] }

const BOM = new RegExp('^\\ufeff')
const CURRENCY = new RegExp('[$\\u20ac\\u00a3\\s]|usd|lbp', 'gi')

function parseMoney(raw: string): number | null {
  let s = raw.replace(CURRENCY, '')
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else s = s.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

function parseCell(type: FieldType, raw: string, label: string): { value?: CellValue; error?: string } {
  switch (type) {
    case 'money': { const v = parseMoney(raw); return v === null ? { error: `${label} "${raw}" is not a price (write it like 45.00)` } : { value: v } }
    case 'cents': { const v = Number(raw); return Number.isInteger(v) && v >= 0 ? { value: v } : { error: `${label} "${raw}" must be a whole number of cents` } }
    case 'int': { const v = Number(raw.replace(/,/g, '')); return Number.isFinite(v) && v >= 0 ? { value: Math.trunc(v) } : { error: `${label} "${raw}" must be a number` } }
    case 'number': { const v = Number(raw.replace(',', '.')); return Number.isFinite(v) && v >= 0 ? { value: v } : { error: `${label} "${raw}" must be a number` } }
    case 'bool': {
      const v = raw.toLowerCase()
      if (['yes', 'y', 'true', '1'].includes(v)) return { value: true }
      if (['no', 'n', 'false', '0'].includes(v)) return { value: false }
      return { error: `${label} "${raw}" must be Yes or No` }
    }
    case 'status': {
      const v = raw.toUpperCase()
      return ['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(v) ? { value: v } : { error: `${label} "${raw}" must be Active, Draft or Archived` }
    }
    case 'list': return { value: raw.split(/[|,]/).map(x => x.trim()).filter(Boolean) }
    default: return { value: raw }
  }
}

// Reads the rows against the column list: which columns the file has (an empty cell is "not
// given"), each cell in its proper type, and the columns nobody understands (shown to the owner).
export function readRows<K extends string>(rows: CsvRow[], columns: Column<K>[]): ParsedFile<K> {
  const lookup = new Map<string, { column: Column<K>; type: FieldType }>()
  for (const column of columns) {
    for (const name of [column.label, ...(column.aliases || [])]) lookup.set(name.toLowerCase(), { column, type: column.type })
    // The old technical names are matched exactly, so "compareAtPrice" (cents) never collides with "Compare-at price".
    for (const name of column.legacy || []) lookup.set(`=${name}`, { column, type: column.legacyType || column.type })
  }
  const headers = rows.length ? Object.keys(rows[0]) : []
  const matched = new Map<string, { column: Column<K>; type: FieldType }>()
  const ignored: string[] = []
  for (const header of headers) {
    const hit = lookup.get(`=${header}`) || lookup.get(header.toLowerCase())
    if (hit && ![...matched.values()].some(m => m.column.key === hit.column.key)) matched.set(header, hit)
    else if (!hit && header.toLowerCase() !== 'id') ignored.push(header)
  }
  const present = new Set([...matched.values()].map(m => m.column.key))
  return {
    columns: present,
    ignored,
    rows: rows.map((row, i) => {
      const values: Partial<Record<K, CellValue>> = {}
      const errors: string[] = []
      for (const [header, { column, type }] of matched) {
        const raw = String(row[header] ?? '').trim()
        if (!raw) continue
        // The export puts a ' before text starting with = + - @ (so spreadsheets don't run it): take it off again.
        const { value, error } = type === 'text' ? { value: raw.replace(/^'(?=[=+\-@])/, ''), error: undefined } : parseCell(type, raw, column.label)
        if (error) errors.push(error)
        else if (value !== undefined) values[column.key] = value
      }
      return { line: i + 2, values, errors }
    }),
  }
}

export const slugify = (v: string | undefined) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)

// "Color:Red|Size:M" -> {Color: "Red", Size: "M"}, as the product editor stores option values.
export const parseVariantOptions = (v?: string) => Object.fromEntries(String(v || '').split('|').map(x => x.trim()).filter(Boolean).map(pair => { const i = pair.indexOf(':'); return i === -1 ? [pair, ''] : [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] }))
export const variantOptionsString = (optionJson: string) => { try { return Object.entries(JSON.parse(optionJson || '{}') as Record<string, unknown>).map(([k, v]) => `${k}:${v}`).join('|') } catch { return '' } }

// ---------------------------------------------------------------------------------------------
// The plan

export type ImportMode = 'all' | 'new' | 'update'
export type ImportOptions = { mode: ImportMode; newAsDraft: boolean; updateStock: boolean }
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { mode: 'all', newAsDraft: true, updateStock: false }

export type Change = { label: string; from: string; to: string }
export type PlanAction = 'create' | 'update' | 'unchanged' | 'skip' | 'error'
export type PlanEntry = { line: number; kind: 'product' | 'variant' | 'collection'; sku: string; name: string; action: PlanAction; changes: Change[]; notes: string[]; errors: string[] }
export type PlanSummary = { create: number; update: number; unchanged: number; skip: number; error: number }

export type StockState = { rows: number; quantity: number; reserved: number }
export type ExistingProduct = {
  id: string; sku: string; name: string; slug: string; status: string; basePrice: number; compareAtPrice: number | null; costPrice: number | null
  description: string | null; shortDescription: string | null; brand: string | null; vendor: string | null; productType: string | null; barcode: string | null
  featured: boolean; trackInventory: boolean; continueSellingWhenOutOfStock: boolean; requiresShipping: boolean; taxable: boolean; giftCard: boolean
  weight: number | null; weightUnit: string | null; seoTitle: string | null; seoDescription: string | null; seoImageUrl: string | null
  tags: string[]; collectionIds: string[]; stock: StockState; lowStockThreshold: number | null
}
export type ExistingVariant = { id: string; sku: string; productSku: string; name: string; barcode: string | null; optionJson: string; price: number | null; compareAtPrice: number | null; stock: StockState; lowStockThreshold: number | null }
export type CatalogLookup = {
  products: Map<string, ExistingProduct>
  variants: Map<string, ExistingVariant>
  // Who owns a URL handle or barcode already (product SKU), to refuse duplicates.
  slugOwner: Map<string, string>
  barcodeOwner: Map<string, string>
  variantBarcodeOwner: Map<string, string>
  collections: Array<{ id: string; name: string; slug: string }>
}

const money = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const text = (v: unknown) => (v == null || v === '' ? '—' : String(v))
const shorten = (v: unknown) => { const s = text(v).replace(/\s+/g, ' '); return s.length > 60 ? `${s.slice(0, 57)}…` : s }
const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

const PRODUCT_LABEL = Object.fromEntries(PRODUCT_COLUMNS.map(c => [c.key, c.label])) as Record<ProductKey, string>
// Plain fields compared one to one: [key, how the value reads in the plan].
const SIMPLE_PRODUCT_FIELDS: Array<[keyof ExistingProduct & ProductKey, (v: unknown) => string]> = [
  ['name', text], ['basePrice', v => money(v as number)], ['compareAtPrice', v => money(v as number)], ['costPrice', v => money(v as number)],
  ['description', shorten], ['shortDescription', shorten], ['brand', text], ['vendor', text], ['productType', text], ['barcode', text], ['slug', text],
  ['featured', v => (v ? 'Yes' : 'No')], ['trackInventory', v => (v ? 'Yes' : 'No')], ['continueSellingWhenOutOfStock', v => (v ? 'Yes' : 'No')],
  ['requiresShipping', v => (v ? 'Yes' : 'No')], ['taxable', v => (v ? 'Yes' : 'No')], ['giftCard', v => (v ? 'Yes' : 'No')],
  ['weight', text], ['weightUnit', text], ['seoTitle', text], ['seoDescription', shorten], ['seoImageUrl', text],
]

// What importing these product rows would do, row by row. Pure: the route loads `lookup`.
export function planProductImport(file: ParsedFile<ProductKey>, lookup: CatalogLookup, options: ImportOptions): PlanEntry[] {
  const plan: PlanEntry[] = []
  const skusInFile = new Set<string>()
  const variantSkusInFile = new Set<string>()
  const slugsInFile = new Map<string, string>()
  const collectionByKey = new Map<string, { id: string; name: string }>()
  for (const c of lookup.collections) { collectionByKey.set(c.slug.toLowerCase(), c); collectionByKey.set(c.name.toLowerCase(), c) }
  const newProductSkus = new Set<string>()

  for (const row of file.rows) {
    const v = row.values
    if (v.variantOf) continue
    const sku = String(v.sku || '')
    const existing = sku ? lookup.products.get(sku) : undefined
    const entry: PlanEntry = { line: row.line, kind: 'product', sku, name: String(v.name || existing?.name || ''), action: existing ? 'update' : 'create', changes: [], notes: [], errors: [...row.errors] }
    if (!sku) entry.errors.push('SKU is missing')
    else if (skusInFile.has(sku)) entry.errors.push(`SKU ${sku} is in the file twice`)
    skusInFile.add(sku)
    if (!existing && !v.name) entry.errors.push('Name is missing (needed for a new product)')

    const slug = v.slug ? slugify(String(v.slug)) : existing ? undefined : slugify(String(v.name || sku))
    if (slug) {
      const owner = lookup.slugOwner.get(slug)
      if (owner && owner !== sku) entry.errors.push(`URL handle "${slug}" already belongs to product ${owner}`)
      if (slugsInFile.has(slug) && slugsInFile.get(slug) !== sku) entry.errors.push(`URL handle "${slug}" is used twice in the file`)
      slugsInFile.set(slug, sku)
    }
    if (v.barcode) { const owner = lookup.barcodeOwner.get(String(v.barcode)); if (owner && owner !== sku) entry.errors.push(`Barcode ${v.barcode} already belongs to product ${owner}`) }
    const collectionNames = (v.collections as string[] | undefined) || []
    const missing = collectionNames.filter(name => !collectionByKey.has(name.toLowerCase()))
    if (missing.length) entry.errors.push(`Collection not found: ${missing.join(', ')} (create it first, or check the spelling)`)

    if (!entry.errors.length) {
      if (existing && options.mode === 'new') { entry.action = 'skip'; entry.notes.push('Already in your store (this import only adds new products)') }
      else if (!existing && options.mode === 'update') { entry.action = 'skip'; entry.notes.push('Not in your store yet (this import only updates existing products)') }
    }

    if (!entry.errors.length && entry.action === 'create') {
      newProductSkus.add(sku)
      const status = options.newAsDraft ? 'DRAFT' : String(v.status || 'DRAFT')
      entry.changes.push({ label: 'Price', from: '', to: money((v.basePrice as number) ?? 0) })
      entry.changes.push({ label: 'Status', from: '', to: statusLabel(status) })
      if (v.quantity !== undefined) entry.changes.push({ label: 'Stock', from: '', to: String(v.quantity) })
      if (options.newAsDraft && v.status && v.status !== 'DRAFT') entry.notes.push(`Saved as Draft (the file says ${statusLabel(String(v.status))})`)
    }

    if (!entry.errors.length && existing && entry.action === 'update') {
      for (const [key, show] of SIMPLE_PRODUCT_FIELDS) {
        if (v[key] === undefined) continue
        const next = key === 'slug' ? slug : v[key]
        if (next !== existing[key]) entry.changes.push({ label: PRODUCT_LABEL[key], from: show(existing[key]), to: show(next) })
      }
      if (v.status !== undefined && v.status !== existing.status) entry.changes.push({ label: 'Status', from: statusLabel(existing.status), to: statusLabel(String(v.status)) })
      if (v.tags !== undefined && !sameList(v.tags as string[], existing.tags)) entry.changes.push({ label: 'Tags', from: text(existing.tags.join(', ')), to: text((v.tags as string[]).join(', ')) })
      if (v.collections !== undefined) {
        const ids = collectionNames.map(name => collectionByKey.get(name.toLowerCase())!.id)
        if (!sameList(ids, existing.collectionIds)) {
          const nameOf = (id: string) => lookup.collections.find(c => c.id === id)?.name || id
          entry.changes.push({ label: 'Collections', from: text(existing.collectionIds.map(nameOf).join(', ')), to: text(ids.map(nameOf).join(', ')) })
        }
      }
      if (v.lowStockThreshold !== undefined && existing.stock.rows <= 1 && v.lowStockThreshold !== existing.lowStockThreshold) entry.changes.push({ label: 'Low stock at', from: text(existing.lowStockThreshold), to: String(v.lowStockThreshold) })
      stockChange(entry, v.quantity as number | undefined, existing.stock, options)
      if (!entry.changes.length) entry.action = 'unchanged'
    }
    plan.push(entry)
  }

  for (const row of file.rows) {
    const v = row.values
    if (!v.variantOf) continue
    const parentSku = String(v.variantOf)
    const sku = String(v.variantSku || '')
    const existing = sku ? lookup.variants.get(sku) : undefined
    const entry: PlanEntry = { line: row.line, kind: 'variant', sku, name: `${String(v.variantName || existing?.name || sku)} (option of ${parentSku})`, action: existing ? 'update' : 'create', changes: [], notes: [], errors: [...row.errors] }
    if (!sku) entry.errors.push('Option SKU is missing')
    else if (variantSkusInFile.has(sku)) entry.errors.push(`Option SKU ${sku} is in the file twice`)
    variantSkusInFile.add(sku)
    const parentExists = lookup.products.has(parentSku) || newProductSkus.has(parentSku)
    if (!parentExists) entry.errors.push(`Product ${parentSku} is not in your store or in this file`)
    if (existing && existing.productSku !== parentSku) entry.errors.push(`Option SKU ${sku} belongs to product ${existing.productSku}`)
    if (v.variantBarcode) { const owner = lookup.variantBarcodeOwner.get(String(v.variantBarcode)); if (owner && owner !== sku) entry.errors.push(`Barcode ${v.variantBarcode} already belongs to option ${owner}`) }

    if (!entry.errors.length) {
      // An option follows its product: a skipped product's options are skipped too.
      const parentEntry = plan.find(p => p.kind === 'product' && p.sku === parentSku)
      if (parentEntry?.action === 'skip') { entry.action = 'skip'; entry.notes.push('Its product is skipped') }
      else if (existing && options.mode === 'new' && !newProductSkus.has(parentSku)) { entry.action = 'skip'; entry.notes.push('Already in your store (this import only adds new products)') }
      else if (!existing && options.mode === 'update') { entry.action = 'skip'; entry.notes.push('Not in your store yet (this import only updates existing products)') }
    }
    if (!entry.errors.length && entry.action === 'create') {
      if (v.variantPrice !== undefined) entry.changes.push({ label: 'Option price', from: '', to: money(v.variantPrice as number) })
      if (v.variantQuantity !== undefined) entry.changes.push({ label: 'Option stock', from: '', to: String(v.variantQuantity) })
    }
    if (!entry.errors.length && existing && entry.action === 'update') {
      if (v.variantName !== undefined && v.variantName !== existing.name) entry.changes.push({ label: 'Option name', from: text(existing.name), to: text(v.variantName) })
      if (v.variantPrice !== undefined && v.variantPrice !== existing.price) entry.changes.push({ label: 'Option price', from: money(existing.price), to: money(v.variantPrice as number) })
      if (v.variantCompareAtPrice !== undefined && v.variantCompareAtPrice !== existing.compareAtPrice) entry.changes.push({ label: 'Option compare-at price', from: money(existing.compareAtPrice), to: money(v.variantCompareAtPrice as number) })
      if (v.variantBarcode !== undefined && v.variantBarcode !== existing.barcode) entry.changes.push({ label: 'Option barcode', from: text(existing.barcode), to: text(v.variantBarcode) })
      if (v.variantOptions !== undefined && JSON.stringify(parseVariantOptions(String(v.variantOptions))) !== JSON.stringify(parseVariantOptions(variantOptionsString(existing.optionJson)))) entry.changes.push({ label: 'Option values', from: text(variantOptionsString(existing.optionJson)), to: text(v.variantOptions) })
      stockChange(entry, v.variantQuantity as number | undefined, existing.stock, options, 'Option stock')
      if (!entry.changes.length) entry.action = 'unchanged'
    }
    if (entry.errors.length) entry.action = 'error'
    plan.push(entry)
  }
  for (const entry of plan) if (entry.errors.length) entry.action = 'error'
  return plan.sort((a, b) => a.line - b.line)
}

// Stock only changes when the owner asks for it, and only where there's one stock row to set.
function stockChange(entry: PlanEntry, quantity: number | undefined, stock: StockState, options: ImportOptions, label = 'Stock') {
  if (quantity === undefined || quantity === stock.quantity) return
  if (!options.updateStock) { entry.notes.push(`${label} in the file (${quantity}) is not applied: tick "Update stock" to apply it`); return }
  if (stock.rows > 1) { entry.notes.push(`${label} is split across locations: change it in Inventory`); return }
  if (quantity < stock.reserved) { entry.errors.push(`${label} ${quantity} is less than the ${stock.reserved} reserved by open orders`); return }
  entry.changes.push({ label, from: String(stock.quantity), to: String(quantity) })
}

export type ExistingCollection = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; isActive: boolean; sortOrder: number; productSkus: string[] }

export function planCollectionImport(file: ParsedFile<CollectionKey>, existingBySlug: Map<string, ExistingCollection>, knownSkus: Set<string>, options: ImportOptions): PlanEntry[] {
  const seen = new Set<string>()
  return file.rows.map(row => {
    const v = row.values
    const slug = slugify(String(v.slug || v.name || ''))
    const existing = slug ? existingBySlug.get(slug) : undefined
    const entry: PlanEntry = { line: row.line, kind: 'collection', sku: slug, name: String(v.name || existing?.name || slug), action: existing ? 'update' : 'create', changes: [], notes: [], errors: [...row.errors] }
    if (!slug) entry.errors.push('Name is missing')
    else if (seen.has(slug)) entry.errors.push(`Collection "${slug}" is in the file twice`)
    seen.add(slug)
    if (!existing && !v.name) entry.errors.push('Name is missing (needed for a new collection)')
    const skus = (v.productSkus as string[] | undefined) || []
    const unknown = skus.filter(sku => !knownSkus.has(sku))
    if (unknown.length) entry.errors.push(`Product SKU not found: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ` and ${unknown.length - 5} more` : ''}`)
    if (!entry.errors.length) {
      if (existing && options.mode === 'new') { entry.action = 'skip'; entry.notes.push('Already in your store (this import only adds new collections)') }
      else if (!existing && options.mode === 'update') { entry.action = 'skip'; entry.notes.push('Not in your store yet (this import only updates existing collections)') }
    }
    if (!entry.errors.length && entry.action === 'create') {
      entry.changes.push({ label: 'Visible', from: '', to: v.isActive === false ? 'No' : 'Yes' })
      if (skus.length) entry.changes.push({ label: 'Products', from: '', to: String(skus.length) })
    }
    if (!entry.errors.length && existing && entry.action === 'update') {
      if (v.name !== undefined && v.name !== existing.name) entry.changes.push({ label: 'Name', from: text(existing.name), to: text(v.name) })
      if (v.description !== undefined && v.description !== existing.description) entry.changes.push({ label: 'Description', from: shorten(existing.description), to: shorten(v.description) })
      if (v.imageUrl !== undefined && v.imageUrl !== existing.imageUrl) entry.changes.push({ label: 'Image', from: text(existing.imageUrl), to: text(v.imageUrl) })
      if (v.isActive !== undefined && v.isActive !== existing.isActive) entry.changes.push({ label: 'Visible', from: existing.isActive ? 'Yes' : 'No', to: v.isActive ? 'Yes' : 'No' })
      if (v.sortOrder !== undefined && v.sortOrder !== existing.sortOrder) entry.changes.push({ label: 'Sort order', from: String(existing.sortOrder), to: String(v.sortOrder) })
      if (v.productSkus !== undefined && !sameList(skus, existing.productSkus)) entry.changes.push({ label: 'Products', from: `${existing.productSkus.length}`, to: `${skus.length}` })
      if (!entry.changes.length) entry.action = 'unchanged'
    }
    if (entry.errors.length) entry.action = 'error'
    return entry
  })
}

export function summarize(plan: PlanEntry[]): PlanSummary {
  const out: PlanSummary = { create: 0, update: 0, unchanged: 0, skip: 0, error: 0 }
  for (const entry of plan) out[entry.action] += 1
  return out
}

export function readImportOptions(form: { get(name: string): unknown }): ImportOptions {
  const mode = String(form.get('importMode') || 'all')
  return {
    mode: mode === 'new' || mode === 'update' ? mode : 'all',
    newAsDraft: String(form.get('newAsDraft') ?? 'true') !== 'false',
    updateStock: String(form.get('updateStock') ?? 'false') === 'true',
  }
}
