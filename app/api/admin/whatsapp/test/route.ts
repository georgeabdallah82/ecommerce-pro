import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { routeError } from '@/lib/api-error'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { internationalPhone } from '@/lib/phone'
import { requestOrigin } from '@/lib/site-url'
import { deliverWhatsApp, templateParams, whatsappCloudConfig } from '@/lib/whatsapp-cloud'
import { WHATSAPP_LABELS, WHATSAPP_UPDATES, type WhatsAppUpdate } from '@/lib/whatsapp-templates'

// "Send a test" in Settings › Email & messaging › Automatic WhatsApp messages: one of the three messages, with a sample
// order, to the number typed there. It uses what is saved (not what is on screen), works before the messages are
// switched on, and reports WhatsApp's answer in plain words (a wrong template name or language shows up here).
// With "arabic", the templates' Arabic version (language "ar"), to check it exists before switching it on.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json().catch(() => null) as { phone?: unknown; kind?: unknown; arabic?: unknown } | null
    const kind: WhatsAppUpdate = WHATSAPP_UPDATES.includes(body?.kind as WhatsAppUpdate) ? body?.kind as WhatsAppUpdate : 'confirmed'
    const config = await whatsappCloudConfig()
    if (!config.phoneNumberId) return json({ error: 'Save the phone number ID first.' }, { status: 400 })
    if (!config.token) return json({ error: 'Save the access key first.' }, { status: 400 })
    const template = config.templates[kind]
    if (!template) return json({ error: `Save the template name for "${WHATSAPP_LABELS[kind]}" first.` }, { status: 400 })
    const to = internationalPhone(String(body?.phone || ''), config.storeCountry)
    if (!to) return json({ error: 'Enter a mobile number that has WhatsApp, e.g. 70 123 456.' }, { status: 400 })
    const limit = await consumeDurableRateLimit(`whatsapp-test:${actor.id}`, 10, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many test messages. Try again in an hour.' }, { status: 429 })
    const sample = { orderNumber: 'TEST-1001', paymentStatus: 'UNPAID', paymentMethod: 'COD', phone: to, grandTotal: 2500, currency: 'USD', shippingAddressJson: JSON.stringify({ firstName: 'Test' }) }
    const language = body?.arabic === true ? 'ar' : config.language
    const result = await deliverWhatsApp(config, { to, template, language, params: templateParams(kind, sample, await requestOrigin(), language) })
    await audit(actor.id, 'whatsapp.test_sent', 'Setting', undefined, { kind, language, ok: result.ok, error: result.ok ? undefined : result.error })
    if (!result.ok && language === 'ar' && result.code === 132001) return json({ error: 'WhatsApp has no Arabic version of "' + template + '" yet: add Arabic to it in WhatsApp Manager › Message templates, with the Arabic text shown here.' }, { status: 400 })
    if (!result.ok) return json({ error: result.error || 'WhatsApp did not take the message.' }, { status: 400 })
    return json({ ok: true })
  } catch (e) {
    return routeError(e, 'Could not send the test message', 400)
  }
}
