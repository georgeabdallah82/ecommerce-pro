import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'

const MAX_ROWS = 10000
const TYPES = new Set(['orders', 'customers', 'products'])

type Row = Array<string | number | boolean | null | Date | undefined>

function csvCell(value: Row[number]) {
  if (value === null || value === undefined) return ''
  const raw = value instanceof Date ? value.toISOString() : String(value)
  // Prevent spreadsheet formula injection when an export is opened in Excel/Sheets.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function csv(headers: string[], rows: Row[]) {
  return [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n') + '\r\n'
}

function unauthorized(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (error instanceof Error && error.message === 'FORBIDDEN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function GET(req: Request) {
  let actor: Awaited<ReturnType<typeof requirePermission>>
  try {
    actor = await requirePermission('reports.view')
  } catch (error) {
    return unauthorized(error) || Response.json({ error: 'Unable to authorize export' }, { status: 500 })
  }

  const type = new URL(req.url).searchParams.get('type')?.trim().toLowerCase() || ''
  if (!TYPES.has(type)) return Response.json({ error: 'type must be orders, customers, or products' }, { status: 400 })

  try {
    let headers: string[]
    let rows: Row[]

    if (type === 'orders') {
      const data = await db.order.findMany({
        take: MAX_ROWS,
        orderBy: { createdAt: 'desc' },
        select: {
          orderNumber: true, email: true, phone: true, subtotal: true, discountTotal: true,
          shippingTotal: true, taxTotal: true, grandTotal: true, currency: true, status: true,
          paymentStatus: true, fulfillmentStatus: true, paymentMethod: true, couponCode: true,
          shippingMethod: true, createdAt: true, updatedAt: true,
        },
      })
      headers = ['order_number', 'email', 'phone', 'subtotal', 'discount_total', 'shipping_total', 'tax_total', 'grand_total', 'currency', 'status', 'payment_status', 'fulfillment_status', 'payment_method', 'coupon_code', 'shipping_method', 'created_at', 'updated_at']
      rows = data.map(o => [o.orderNumber, o.email, o.phone, o.subtotal, o.discountTotal, o.shippingTotal, o.taxTotal, o.grandTotal, o.currency, o.status, o.paymentStatus, o.fulfillmentStatus, o.paymentMethod, o.couponCode, o.shippingMethod, o.createdAt, o.updatedAt])
    } else if (type === 'customers') {
      const data = await db.user.findMany({
        where: { role: 'CUSTOMER' },
        take: MAX_ROWS,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, phone: true, isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true },
      })
      headers = ['id', 'name', 'email', 'phone', 'is_active', 'email_verified_at', 'last_login_at', 'created_at', 'updated_at']
      rows = data.map(u => [u.id, u.name, u.email, u.phone, u.isActive, u.emailVerifiedAt, u.lastLoginAt, u.createdAt, u.updatedAt])
    } else {
      const data = await db.product.findMany({
        take: MAX_ROWS,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, slug: true, brand: true, vendor: true, productType: true,
          basePrice: true, compareAtPrice: true, costPrice: true, sku: true, barcode: true,
          status: true, featured: true, requiresShipping: true, taxable: true, trackInventory: true,
          continueSellingWhenOutOfStock: true, category: { select: { name: true } }, createdAt: true, updatedAt: true,
        },
      })
      headers = ['id', 'name', 'slug', 'brand', 'vendor', 'product_type', 'base_price', 'compare_at_price', 'cost_price', 'sku', 'barcode', 'status', 'featured', 'requires_shipping', 'taxable', 'track_inventory', 'continue_selling_when_out_of_stock', 'category', 'created_at', 'updated_at']
      rows = data.map(p => [p.id, p.name, p.slug, p.brand, p.vendor, p.productType, p.basePrice, p.compareAtPrice, p.costPrice, p.sku, p.barcode, p.status, p.featured, p.requiresShipping, p.taxable, p.trackInventory, p.continueSellingWhenOutOfStock, p.category?.name, p.createdAt, p.updatedAt])
    }

    await audit(actor.id, 'admin.data_exported', 'Export', type, { type, rows: rows.length, maxRows: MAX_ROWS })

    const body = csv(headers, rows)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ecommerce-pro-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[admin/exports] failed', error)
    return Response.json({ error: 'Unable to generate export' }, { status: 500 })
  }
}
