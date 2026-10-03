import { json } from '@/lib/utils'
import { publicBundles } from '@/lib/bundles'
import { getUnpublishedProductIds } from '@/lib/sales-channels'

// The storefront's "Bundle & save" section. Empty while bundles are switched off.
export async function GET() {
  try {
    const bundles = await publicBundles(await getUnpublishedProductIds())
    return json({ bundles }, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } })
  } catch (error) {
    console.error('[bundles] load failed', error)
    return json({ bundles: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
