import type { Prisma } from '@prisma/client'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'

const noStore = { 'Cache-Control': 'private, no-store' }
const FILTERS = new Set(['all', 'low', 'out', 'in'])

// Stock for the Android admin app, a page at a time: search by product name, SKU or barcode, and
// filter to low or sold-out rows. "Available" is on hand minus reserved for open orders, the same
// figure the store sells from. Changes go through the web's PATCH /api/admin/inventory, so stock
// movements, low-stock alerts, back-in-stock messages and webhooks stay the same.
//
// The low and sold-out filters compare two columns, which Prisma can't express, so they first
// pick the row ids in SQL and then load those rows.
export async function GET(req: Request) {
  try {
    await requirePermission('inventory.view')
    const params = new URL(req.url).searchParams
    const q = (params.get('q') || '').trim().slice(0, 120)
    const filter = FILTERS.has(params.get('filter') || '') ? params.get('filter')! : 'all'
    const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
    const pageSize = Math.min(100, Math.max(10, Math.floor(Number(params.get('pageSize')) || 30)))
    const like = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`

    const idRows = await db.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM "InventoryItem" i
      JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "ProductVariant" v ON v.id = i."variantId"
      WHERE p.status <> 'ARCHIVED'
        AND (${q} = '' OR p.name ILIKE ${like} OR p.sku ILIKE ${like} OR COALESCE(p.barcode, '') ILIKE ${like} OR COALESCE(v.name, '') ILIKE ${like} OR COALESCE(v.sku, '') ILIKE ${like} OR COALESCE(v.barcode, '') ILIKE ${like})
        AND (${filter} = 'all'
          OR (${filter} = 'low' AND i.quantity - i.reserved <= i."lowStockThreshold" AND i.quantity - i.reserved > 0)
          OR (${filter} = 'out' AND i.quantity - i.reserved <= 0)
          OR (${filter} = 'in' AND i.quantity - i.reserved > i."lowStockThreshold"))
      ORDER BY (i.quantity - i.reserved) ASC, p.name ASC, i.id ASC
    `
    const total = idRows.length
    const pageIds = idRows.slice((page - 1) * pageSize, page * pageSize).map(row => row.id)
    const where: Prisma.InventoryItemWhereInput = { id: { in: pageIds } }
    const rows = pageIds.length ? await db.inventoryItem.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, status: true, trackInventory: true, continueSellingWhenOutOfStock: true, preorder: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } },
        variant: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, type: true, quantity: true, reason: true, createdAt: true } },
      },
    }) : []
    const order = new Map(pageIds.map((id, index) => [id, index]))
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

    const [summary] = await db.$queryRaw<{ total: number; low: number; out: number; units: number }[]>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE i.quantity - i.reserved <= i."lowStockThreshold" AND i.quantity - i.reserved > 0)::int AS low,
             COUNT(*) FILTER (WHERE i.quantity - i.reserved <= 0)::int AS out,
             COALESCE(SUM(GREATEST(0, i.quantity - i.reserved)), 0)::int AS units
      FROM "InventoryItem" i JOIN "Product" p ON p.id = i."productId"
      WHERE p.status <> 'ARCHIVED'
    `

    return json({
      items: rows.map(row => {
        const available = row.quantity - row.reserved
        return {
          id: row.id, productId: row.productId, variantId: row.variantId,
          name: row.product.name, variant: row.variant?.name ?? null, sku: row.variant?.sku || row.product.sku,
          productStatus: row.product.status, trackInventory: row.product.trackInventory, sellsWhenOut: row.product.continueSellingWhenOutOfStock || row.product.preorder,
          imageUrl: row.product.images[0]?.url ?? null, location: row.location?.name ?? null,
          quantity: row.quantity, reserved: row.reserved, available, lowStockThreshold: row.lowStockThreshold,
          state: available <= 0 ? 'out' : available <= row.lowStockThreshold ? 'low' : 'in',
          movements: row.movements,
        }
      }),
      page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)),
      summary: { total: Number(summary?.total || 0), low: Number(summary?.low || 0), out: Number(summary?.out || 0), units: Number(summary?.units || 0) },
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load stock', 400, noStore) }
}
