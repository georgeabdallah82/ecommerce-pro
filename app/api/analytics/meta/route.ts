import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { clientIp } from '@/lib/request-ip'
import { consumeRateLimit } from '@/lib/rate-limit'
import { runInBackground } from '@/lib/background'
import { parseAgent } from '@/lib/visitor-agent'
import { isStaffUser } from '@/lib/visitor-tracking'
import { adContextFromRequest, metaCapiConfig, readFunnelEvent, sendMetaFunnelEvent } from '@/lib/meta-capi'

// Page views, product views, "added to cart" and "started checkout", reported by the shopper's browser next to the Meta pixel
// (lib/tracking-events.ts). They are forwarded to Meta from here with the pixel's own event id, so Meta
// counts each once and still hears about it when the shopper's browser blocks the pixel. Nothing is
// stored; nothing happens until a Pixel ID and access token are saved in Settings > Tracking.
export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`meta-event:ip:${clientIp(req.headers)}`, 60, 60 * 1000)
    if (!limit.allowed) return json({ ok: true, throttled: true }, { status: 202 })
    const event = readFunnelEvent(await req.json().catch(() => null))
    if (!event) return json({ error: 'Invalid event' }, { status: 400 })
    // Search engines and other robots are not shoppers.
    if (parseAgent(req.headers.get('user-agent')).bot) return json({ ok: true, sent: false })
    const config = await metaCapiConfig()
    if (!config.enabled) return json({ ok: true, sent: false })
    // The owner and staff trying their own store are not customers.
    const user = await getCurrentUser()
    if (isStaffUser(user)) return json({ ok: true, sent: false, staff: true })
    runInBackground(sendMetaFunnelEvent(event, {
      context: adContextFromRequest(req),
      storeUrl: new URL(req.url).origin,
      userId: user?.role === 'CUSTOMER' ? user.id : null,
    }))
    return json({ ok: true, sent: true }, { status: 202 })
  } catch (error) {
    console.error('[analytics/meta] failure', error)
    return json({ error: 'Unable to report the event' }, { status: 500 })
  }
}
