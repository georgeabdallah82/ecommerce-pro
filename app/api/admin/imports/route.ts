import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'

const MAX_ROWS = 500
const MAX_BYTES = 2 * 1024 * 1024
const allowedStatus = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED'])

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.length === 0) quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (quoted) throw new Error('Invalid CSV: unterminated quoted field')
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(v => v.trim() !== ''))
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180)
}

function bool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === '') return fallback
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function moneyInt(value: string | undefined) {
  if (value === undefined || value.trim() === '') return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error('Prices must be non-negative numbers')
  return Math.trunc(n)
}

export async function POST(req: Request) {
  let actor: Awaited<ReturnType<typeof requirePermission>>
  try { actor = await requirePermission('products.manage') }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    return Response.json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Forbidden' }, { status: message === 'UNAUTHORIZED' ? 401 : 403 })
  }

  try {
    const type = new URL(req.url).searchParams.get('type')?.trim().toLowerCase()
    if (type !== 'products') return Response.json({ error: 'Only product imports are supported' }, { status: 400 })
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BYTES) return Response.json({ error: 'CSV is too large (maximum 2 MB)' }, { status: 413 })
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'CSV file is required' }, { status: 400 })
    if (file.size > MAX_BYTES) return Response.json({ error: 'CSV is too large (maximum 2 MB)' }, { status: 413 })
    const rows = parseCsv(await file.text().then(v => v.replace(/^\uFEFF/, '')))
    if (rows.length < 2) return Response.json({ error: 'CSV must contain a header and at least one product' }, { status: 400 })
    if (rows.length - 1 > MAX_ROWS) return Response.json({ error: `Maximum ${MAX_ROWS} products per import` }, { status: 400 })

    const headers = rows[0].map(h => h.trim().toLowerCase())
    const index = (name: string) => headers.indexOf(name)
    const required = ['name', 'sku', 'base_price']
    const missing = required.filter(name => index(name) < 0)
    if (missing.length) return Response.json({ error: `Missing required columns: ${missing.join(', ')}` }, { status: 400 })

    const categories = await db.category.findMany({ select: { id: true, name: true } })
    const categoryMap = new Map(categories.map(c => [c.name.trim().toLowerCase(), c.id]))
    let created = 0
    let updated = 0
    const errors: string[] = []

    for (let r = 1; r < rows.length; r += 1) {
      const values = rows[r]
      const get = (name: string) => { const i = index(name); return i >= 0 ? values[i]?.trim() : undefined }
      const rowNumber = r + 1
      try {
        const name = (get('name') || '').slice(0, 200)
        const sku = (get('sku') || '').slice(0, 120)
        if (!name || !sku) throw new Error('name and sku are required')
        const statusRaw = (get('status') || 'DRAFT').toUpperCase()
        if (!allowedStatus.has(statusRaw)) throw new Error('status must be DRAFT, ACTIVE, or ARCHIVED')
        const categoryName = get('category')
        const categoryId = categoryName ? categoryMap.get(categoryName.toLowerCase()) || null : null
        const slug = slugify(get('slug') || name) || `product-${Date.now()}-${r}`
        const data = {
          name, slug, sku,
          brand: get('brand')?.slice(0, 160) || null,
          vendor: get('vendor')?.slice(0, 160) || null,
          productType: get('product_type')?.slice(0, 160) || null,
          basePrice: moneyInt(get('base_price')),
          compareAtPrice: get('compare_at_price') ? moneyInt(get('compare_at_price')) : null,
          costPrice: get('cost_price') ? moneyInt(get('cost_price')) : null,
          barcode: get('barcode')?.slice(0, 120) || null,
          status: statusRaw as 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
          featured: bool(get('featured'), false),
          requiresShipping: bool(get('requires_shipping'), true),
          taxable: bool(get('taxable'), true),
          trackInventory: bool(get('track_inventory'), true),
          continueSellingWhenOutOfStock: bool(get('continue_selling_when_out_of_stock'), false),
          categoryId,
          publishedAt: statusRaw === 'ACTIVE' ? new Date() : null,
        }
        const existing = await db.product.findUnique({ where: { sku }, select: { id: true } })
        if (existing) { await db.product.update({ where: { id: existing.id }, data }); updated += 1 }
        else { await db.product.create({ data }); created += 1 }
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'invalid row'}`)
      }
    }

    await audit(actor.id, 'admin.data_imported', 'Import', 'products', { fileName: file.name.slice(0, 200), rows: rows.length - 1, created, updated, errors: errors.length })
    return Response.json({ ok: true, created, updated, errors, processed: created + updated })
  } catch (error) {
    console.error('[admin/imports] failed', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to import products' }, { status: 400 })
  }
}
