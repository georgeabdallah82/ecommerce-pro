import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const MAX_FAQS = 100

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'You do not have permission to change the AI assistant.' }, { status: 403, headers: NO_STORE })
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  console.error('[admin/assistant/faqs] failure', error)
  return json({ error: 'Unable to save the answer' }, { status: 500, headers: NO_STORE })
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
const listFaqs = () => db.assistantFaq.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })

function fields(body: Record<string, unknown>) {
  return {
    question: text(body.question, 300),
    questionAr: text(body.questionAr, 300) || null,
    answer: text(body.answer, 1500),
    answerAr: text(body.answerAr, 1500) || null,
    isActive: body.isActive !== false,
  }
}

// Admin › AI assistant › FAQ: the store's own answers, which the assistant reads (search_faq) and
// quotes instead of guessing. Shown to shoppers within 30 seconds.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('assistant.manage')
    const body = await req.json().catch(() => ({}))
    const data = fields(body || {})
    if (!data.question || !data.answer) return json({ error: 'Write the question and the answer.' }, { status: 400, headers: NO_STORE })
    if ((await db.assistantFaq.count()) >= MAX_FAQS) return json({ error: `You can keep up to ${MAX_FAQS} answers. Remove one first.` }, { status: 400, headers: NO_STORE })
    const last = await db.assistantFaq.aggregate({ _max: { sortOrder: true } })
    const faq = await db.assistantFaq.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } })
    await audit(actor.id, 'assistant.faq.created', 'AssistantFaq', faq.id, { question: data.question.slice(0, 120) })
    return json({ ok: true, faqs: await listFaqs() }, { status: 201, headers: NO_STORE })
  } catch (error) { return failure(error) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('assistant.manage')
    const body = await req.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    const data = fields(body)
    if (!data.question || !data.answer) return json({ error: 'Write the question and the answer.' }, { status: 400, headers: NO_STORE })
    const found = await db.assistantFaq.findUnique({ where: { id }, select: { id: true } })
    if (!found) return json({ error: 'That answer was removed.' }, { status: 404, headers: NO_STORE })
    await db.assistantFaq.update({ where: { id }, data })
    await audit(actor.id, 'assistant.faq.updated', 'AssistantFaq', id, { question: data.question.slice(0, 120), isActive: data.isActive })
    return json({ ok: true, faqs: await listFaqs() }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('assistant.manage')
    const body = await req.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    const { count } = await db.assistantFaq.deleteMany({ where: { id } })
    if (count) await audit(actor.id, 'assistant.faq.deleted', 'AssistantFaq', id)
    return json({ ok: true, faqs: await listFaqs() }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}
