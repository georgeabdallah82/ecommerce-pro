import { getBoughtTogether } from '@/lib/recommendations'
import { json } from '@/lib/utils'

const MAX_IDS = 20
const MAX_LIMIT = 8

// Suggestions for the products in a cart ("Goes well with your cart" in the cart drawer,
// components/cart-suggestions.tsx): ?ids=<product id>,<product id>&limit=6. See lib/recommendations.ts.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const ids = String(url.searchParams.get('ids') || '').split(',').map(id => id.trim()).filter(id => /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, MAX_IDS)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 6))
  if (!ids.length) return json({ products: [] })
  try {
    const products = await getBoughtTogether(ids, limit)
    return json({ products }, { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch (error) {
    console.error('[recommendations] failed', error)
    return json({ products: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
