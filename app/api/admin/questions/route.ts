import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { ANSWER_MAX } from '@/lib/product-questions'

// Admin > Content > Questions: answer, show or hide on the product page, or delete a question.
export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('reviews.manage')
    const body = await req.json().catch(() => ({})) as { id?: unknown; answer?: unknown; published?: unknown }
    const id = String(body.id || '')
    const current = id ? await db.productQuestion.findUnique({ where: { id }, select: { id: true, answer: true } }) : null
    if (!current) return json({ error: 'Question not found' }, { status: 404 })
    const data: { answer?: string | null; answeredAt?: Date | null; published?: boolean } = {}
    if (body.answer !== undefined) {
      const answer = String(body.answer || '').replace(/\r\n/g, '\n').trim()
      if (answer.length > ANSWER_MAX) return json({ error: 'The answer is too long' }, { status: 400 })
      data.answer = answer || null
      data.answeredAt = answer ? new Date() : null
    }
    if (body.published !== undefined) data.published = Boolean(body.published)
    // Only answered questions show on the product page.
    const answer = data.answer !== undefined ? data.answer : current.answer
    if (data.published && !answer) return json({ error: 'Write the answer first' }, { status: 400 })
    if (!answer) data.published = false
    const question = await db.productQuestion.update({ where: { id }, data, include: { product: { select: { id: true, name: true, slug: true } } } })
    await audit(actor.id, 'question.updated', 'ProductQuestion', id, { published: question.published, answered: !!question.answer })
    return json({ question })
  } catch (error) {
    return routeError(error, 'Unable to save the answer', 400)
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('reviews.manage')
    const id = new URL(req.url).searchParams.get('id') || ''
    const removed = await db.productQuestion.deleteMany({ where: { id } })
    if (!removed.count) return json({ error: 'Question not found' }, { status: 404 })
    await audit(actor.id, 'question.deleted', 'ProductQuestion', id, {})
    return json({ ok: true })
  } catch (error) {
    return routeError(error, 'Unable to delete the question', 400)
  }
}
