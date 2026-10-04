import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { metaCapiConfig, sendMetaEvents } from '@/lib/meta-capi'

// "Check connection" in Settings › Tracking: sends one test Purchase that shows up only under
// Events Manager › Test events (it needs the test code, so it never counts as a real sale).
export async function POST(req: Request) {
  try {
    await requirePermission('settings.manage')
    const config = await metaCapiConfig()
    if (!config.pixelId) return json({ error: 'Save your Meta Pixel ID first.' }, { status: 400 })
    if (!config.token) return json({ error: 'Save your Conversions API access token first.' }, { status: 400 })
    if (!config.testCode) return json({ error: 'Add the test code from Events Manager › Test events, save, then check again.' }, { status: 400 })
    const result = await sendMetaEvents([{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `test-${Date.now()}`,
      action_source: 'website',
      event_source_url: `${new URL(req.url).origin}/order/success`,
      user_data: { client_user_agent: req.headers.get('user-agent') || 'store-test', client_ip_address: (req.headers.get('cf-connecting-ip') || '').trim() || undefined },
      custom_data: { currency: 'USD', value: 1, content_type: 'product', content_ids: ['test'] },
    }], config)
    return json({ ok: true, received: result.events_received ?? 0 })
  } catch (e) {
    return json({ error: e instanceof Error ? `Meta said: ${e.message}` : 'Could not reach Meta' }, { status: 400 })
  }
}
