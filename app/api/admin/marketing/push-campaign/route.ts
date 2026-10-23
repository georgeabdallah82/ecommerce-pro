import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { sendCustomerPushCampaign } from '@/lib/push'
import { getThemeState } from '@/lib/theme'

// The store's icon on the notification: the theme's favicon, else its logo. Phones don't draw
// SVG notification icons, so an SVG one is left out (the browser's own icon shows instead).
async function notificationIcon() {
  const theme: any = (await getThemeState().catch(() => null))?.theme || {}
  return [theme.faviconUrl, theme.logoUrl].map(v => String(v || '').trim()).find(v => v && !/\.svg(\?|$)/i.test(v) && /^(https:\/\/|\/(?!\/))/.test(v)) || undefined
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const body = await req.json().catch(() => ({}))
    const title = String(body?.title || '').trim()
    const message = String(body?.body || '').trim()
    const url = String(body?.url || '').trim()
    if (!title) return json({ error: 'Title is required' }, { status: 400 })
    if (!message) return json({ error: 'Message is required' }, { status: 400 })
    if (url && !url.startsWith('/')) return json({ error: 'URL must be a relative path starting with /' }, { status: 400 })

    const result = await sendCustomerPushCampaign({ title, body: message, url: url || undefined, icon: await notificationIcon() })
    await audit(actor.id, 'ADMIN_PUSH_CAMPAIGN', 'customer', undefined, { title, sent: result.sent, failed: result.failed })
    return json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send push campaign'
    return json({ error: message === 'FORBIDDEN' ? 'Forbidden' : message === 'UNAUTHORIZED' ? 'Unauthorized' : message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
