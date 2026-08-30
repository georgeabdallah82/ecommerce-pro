import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'

const MAX_ROWS = 500
const MAX_BYTES = 2 * 1024 * 1024
const allowedStatus = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED'])

type CsvRow = Record<string, string>

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
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
  const nonEmpty = rows.filter(r => r.some(v => v.trim() !== ''))
  if (!nonEmpty.length) return []
  const headers = nonEmpty[0].map(h => h.trim().toLowerCase())
  return nonEmpty.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').trim()])))
}

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) }
function bool(value: string | undefined, fallback: boolean) { if (!value?.trim()) return fallback; return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()) }
function int(value: string | undefined, fallback = 0) { if (!value?.trim()) return fallback; const n = Number(value); if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error('Expected an integer'); return n }
function moneyInt(value: string | undefined) { if (!value?.trim()) return 0; const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new Error('Prices must be non-negative numbers'); return Math.trunc(n) }
function unauthorized(error: unknown) { const message = error instanceof Error ? error.message : ''; return Response.json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Forbidden' }, { status: message === 'UNAUTHORIZED' ? 401 : 403 }) }

export async function POST(req: Request) {
  let actor: Awaited<ReturnType<typeof requirePermission>>
  try { actor = await requirePermission('products.manage') } catch (e) { return unauthorized(e) }

  try {
    const type = new URL(req.url).searchParams.get('type')?.trim().toLowerCase()
    if (!['products', 'categories', 'collections'].includes(type || '')) return Response.json({ error: 'type must be products, categories, or collections' }, { status: 400 })
    const length = Number(req.headers.get('content-length') || 0)
    if (length > MAX_BYTES) return Response.json({ error: 'CSV is too large (maximum 2 MB)' }, { status: 413 })
    const form = await req.formData(); const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'CSV file is required' }, { status: 400 })
    if (file.size > MAX_BYTES) return Response.json({ error: 'CSV is too large (maximum 2 MB)' }, { status: 413 })
    const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''))
    if (!rows.length) return Response.json({ error: 'CSV must contain a header and at least one row' }, { status: 400 })
    if (rows.length > MAX_ROWS) return Response.json({ error: `Maximum ${MAX_ROWS} rows per import` }, { status: 400 })

    let created = 0, updated = 0
    const errors: string[] = []

    if (type === 'categories') {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i], row = i + 2
        try {
          const name = (r.name || '').slice(0, 200), slug = slugify(r.slug || name)
          if (!name || !slug) throw new Error('name is required')
          const parentSlug = r.parent_slug || ''
          const parent = parentSlug ? await db.category.findUnique({ where: { slug: parentSlug }, select: { id: true } }) : null
          if (parentSlug && !parent) throw new Error(`parent_slug not found: ${parentSlug}`)
          const data = { name, slug, description: r.description?.slice(0, 2000) || null, imageUrl: r.image_url?.slice(0, 2000) || null, isActive: bool(r.is_active, true), sortOrder: int(r.sort_order, 0), parentId: parent?.id || null }
          const existing = await db.category.findUnique({ where: { slug }, select: { id: true } })
          if (existing) { await db.category.update({ where: { id: existing.id }, data }); updated += 1 } else { await db.category.create({ data }); created += 1 }
        } catch (e) { errors.push(`Row ${row}: ${e instanceof Error ? e.message : 'invalid row'}`) }
      }
    } else if (type === 'collections') {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i], row = i + 2
        try {
          const name = (r.name || '').slice(0, 200), slug = slugify(r.slug || name)
          if (!name || !slug) throw new Error('name is required')
          const data = { name, slug, description: r.description?.slice(0, 2000) || null, imageUrl: r.image_url?.slice(0, 2000) || null, isActive: bool(r.is_active, true), sortOrder: int(r.sort_order, 0) }
          const existing = await db.collection.findUnique({ where: { slug }, select: { id: true } })
          if (existing) { await db.collection.update({ where: { id: existing.id }, data }); updated += 1 } else { await db.collection.create({ data }); created += 1 }
        } catch (e) { errors.push(`Row ${row}: ${e instanceof Error ? e.message : 'invalid row'}`) }
      }
    } else {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i], row = i + 2
        try {
          const name = (r.name || '').slice(0, 200), sku = (r.sku || '').slice(0, 120)
          if (!name || !sku) throw new Error('name and sku are required')
          const status = (r.status || 'DRAFT').toUpperCase()
          if (!allowedStatus.has(status)) throw new Error('status must be DRAFT, ACTIVE, or ARCHIVED')
          const categoryKey = r.category_slug || r.category || ''
          let categoryId: string | null = null
          if (categoryKey) {
            const category = await db.category.findUnique({ where: { slug: categoryKey }, select: { id: true } }) || await db.category.findFirst({ where: { name: { equals: categoryKey, mode: 'insensitive' } }, select: { id: true } })
            if (!category) throw new Error(`category not found: ${categoryKey}`)
            categoryId = category.id
          }
          const slug = slugify(r.slug || name) || `product-${Date.now()}-${i}`
          const data = { name, slug, sku, brand: r.brand?.slice(0, 160) || null, vendor: r.vendor?.slice(0, 160) || null, productType: r.product_type?.slice(0, 160) || null, basePrice: moneyInt(r.base_price), compareAtPrice: r.compare_at_price ? moneyInt(r.compare_at_price) : null, costPrice: r.cost_price ? moneyInt(r.cost_price) : null, barcode: r.barcode?.slice(0, 120) || null, status: status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED', featured: bool(r.featured, false), requiresShipping: bool(r.requires_shipping, true), taxable: bool(r.taxable, true), trackInventory: bool(r.track_inventory, true), continueSellingWhenOutOfStock: bool(r.continue_selling_when_out_of_stock, false), categoryId, publishedAt: status === 'ACTIVE' ? new Date() : null }
          const existing = await db.product.findUnique({ where: { sku }, select: { id: true } })
          const product = existing ? await db.product.update({ where: { id: existing.id }, data }) : await db.product.create({ data })
          if (existing) updated += 1; else created += 1
          if (r.collection_slugs !== undefined) {
            const slugs = r.collection_slugs.split(/[|;]/).map(s => s.trim()).filter(Boolean)
            const collections = slugs.length ? await db.collection.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } }) : []
            const found = new Set(collections.map(c => c.slug))
            const missing = slugs.filter(s => !found.has(s))
            if (missing.length) throw new Error(`collection slug(s) not found: ${missing.join(', ')}`)
            await db.collectionProduct.deleteMany({ where: { productId: product.id } })
            if (collections.length) await db.collectionProduct.createMany({ data: collections.map((c, index) => ({ collectionId: c.id, productId: product.id, sortOrder: index })) })
          }
        } catch (e) { errors.push(`Row ${row}: ${e instanceof Error ? e.message : 'invalid row'}`) }
      }
    }

    await audit(actor.id, 'admin.data_imported', 'Import', type!, { fileName: file.name.slice(0, 200), rows: rows.length, created, updated, errors: errors.length })
    return Response.json({ ok: true, type, created, updated, processed: created + updated, errors })
  } catch (e) {
    console.error('[admin/imports] failed', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Unable to import data' }, { status: 400 })
  }
}
