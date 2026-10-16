// Questions and answers on product pages: a shopper asks, the owner answers in Admin > Questions,
// and published answers show on the product page for everyone. The shopper's WhatsApp number is
// optional and private -- only for telling them the answer.

export const QUESTION_MAX = 500
export const ANSWER_MAX = 2000
export const QUESTION_NAME_MAX = 60

export type QuestionInput = { productId: string; name: string; question: string; phone: string }

// What the product page sends. `website` is a field people never see: bots fill it in.
export function parseQuestion(raw: unknown): { value?: QuestionInput; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Invalid question' }
  const b = raw as Record<string, unknown>
  if (typeof b.website === 'string' && b.website.trim()) return { error: 'Invalid question' }
  const productId = String(b.productId || '').trim().slice(0, 64)
  const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim() : ''
  const question = typeof b.question === 'string' ? b.question.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : ''
  const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 40) : ''
  if (!productId) return { error: 'Invalid question' }
  if (!name) return { error: 'Please add your name.' }
  if (name.length > QUESTION_NAME_MAX) return { error: 'Your name is too long.' }
  if (question.length < 5) return { error: 'Please write your question.' }
  if (question.length > QUESTION_MAX) return { error: 'Your question is too long.' }
  return { value: { productId, name, question, phone } }
}

// What staff send the shopper on WhatsApp once answered (English, like the other admin messages).
export function questionAnsweredMessage(input: { storeName: string; name: string; productName: string; answer: string; link: string }) {
  const first = input.name.split(/\s+/)[0] || ''
  return [
    `Hi${first ? ` ${first}` : ''}! Thank you for your question about ${input.productName} at ${input.storeName || 'our store'}.`,
    '',
    input.answer,
    '',
    input.link,
  ].join('\n')
}
