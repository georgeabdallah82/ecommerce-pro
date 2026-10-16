import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { internationalPhone } from '@/lib/phone'
import { getSellingConfig } from '@/lib/selling-config'
import { parseQuestion } from '@/lib/product-questions'
import { sendNewQuestionAlert } from '@/lib/push'
import { runInBackground } from '@/lib/background'

const NO_STORE = { 'Cache-Control': 'no-store' }

// "Ask a question" on a product page (lib/product-questions.ts). Saved privately; it shows on the
// page once the owner answers and publishes it.
export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`question:${clientIp(req.headers)}`, 6, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many questions. Please try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterSeconds) } })
    if (Number(req.headers.get('content-length') || 0) > 8 * 1024) return json({ error: 'Your question is too long.' }, { status: 413, headers: NO_STORE })
    const selling = await getSellingConfig().catch(() => null)
    if (selling && !selling.questions) return json({ error: 'Questions are closed for now.' }, { status: 404, headers: NO_STORE })
    const parsed = parseQuestion(await req.json().catch(() => null))
    if (!parsed.value) return json({ error: parsed.error || 'Invalid question' }, { status: 400, headers: NO_STORE })
    const input = parsed.value
    const product = await db.product.findFirst({ where: { id: input.productId, status: 'ACTIVE' }, select: { id: true, name: true } })
    if (!product) return json({ error: 'Invalid question' }, { status: 400, headers: NO_STORE })
    const country = (await db.setting.findUnique({ where: { key: 'store.country' } }).catch(() => null))?.value || 'Lebanon'
    const phone = input.phone ? internationalPhone(input.phone, country) : ''
    if (input.phone && !phone) return json({ error: 'This number looks incomplete. Check it, e.g. 70 123 456.' }, { status: 400, headers: NO_STORE })
    const saved = await db.productQuestion.create({ data: { productId: product.id, name: input.name, question: input.question, phone: phone || null }, select: { id: true } })
    runInBackground(sendNewQuestionAlert({ id: saved.id, productName: product.name }).catch(error => console.error('[push] new question alert failed', error)))
    return json({ ok: true }, { status: 201, headers: NO_STORE })
  } catch (error) {
    console.error('[questions] ask failed', error)
    return json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: NO_STORE })
  }
}
