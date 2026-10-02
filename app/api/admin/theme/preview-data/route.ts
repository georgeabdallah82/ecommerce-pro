import { requirePermission } from '@/lib/auth'
import { loadZoneData } from '@/lib/zone-data'
import { json } from '@/lib/utils'

// The products and collections the theme studio previews with and offers in its pickers.
// Same queries as the live storefront (lib/zone-data.ts), so the editor can only ever offer
// and show what a visitor would see. Needs the editor permission, not products/collections
// access, since it only feeds the studio.
export async function GET() {
  try {
    await requirePermission('content.view')
    const { products, collections } = await loadZoneData()
    return json({ products, collections }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to load preview data' }, { status: 400 })
  }
}
