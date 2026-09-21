import { db } from '@/lib/prisma'
import { authenticateApiCredential, ApiAuthError } from '@/lib/api-credentials'
import { json } from '@/lib/utils'

// The first real API surface the ApiCredential feature (app/api/admin/api-credentials/route.ts)
// actually gates -- previously a merchant could mint a key with any scope and it authenticated
// nothing anywhere. Meant for backend integrations (an ERP or inventory sync tool), not the
// storefront: unlike the public, unauthenticated GET /api/products listing, this exposes
// internal fields (costPrice, per-location inventory) a merchant explicitly grants a
// products.read-scoped credential access to.
export async function GET(req: Request) {
  try {
    await authenticateApiCredential(req, 'products.read')
    const url = new URL(req.url)
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
    const products = await db.product.findMany({
      select: {
        id: true, sku: true, name: true, slug: true, status: true,
        basePrice: true, compareAtPrice: true, costPrice: true, barcode: true, updatedAt: true,
        inventory: { select: { quantity: true, reserved: true, locationId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    })
    return json({ products })
  } catch (error) {
    if (error instanceof ApiAuthError) return json({ error: error.message }, { status: 401 })
    console.error('[api/v1/products] unexpected failure', error)
    return json({ error: 'Unable to load products' }, { status: 500 })
  }
}
