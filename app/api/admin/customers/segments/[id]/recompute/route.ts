import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { recomputeSegmentMembership } from '@/lib/customer-segments'

// Re-runs a rule-based segment's matching against current customer data and adds any newly
// qualifying customers as members. Admin-triggered rather than automatic (on a schedule or on
// every order) since evaluating every customer's stats on every order would be wasteful for a
// segment nobody's looking at right now -- staff click Recompute when they want a fresh count,
// the same on-demand shape as the existing gift-card/coupon backfill actions elsewhere in the
// admin.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customerSegments.manage')
    const { id } = await params
    const added = await recomputeSegmentMembership(id)
    await audit(actor.id, 'customer_segment.recomputed', 'CustomerSegment', id, { added })
    return json({ added })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to recompute segment membership'
    return json({ error: message }, { status: message === 'Segment not found' ? 404 : 400 })
  }
}
