import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'
import { getContactInfo, getPolicyInfo } from '@/lib/store-contact'
import { getPublicPaymentMethods } from '@/lib/payment-methods-public'
import { resolveFreeShippingThresholdCents } from '@/lib/pricing'
import { normalize, words } from '@/lib/smart-search'

// What the assistant may say about the store: only what the store's own settings, delivery zones,
// policy pages and FAQ (Admin › AI assistant) say. Anything not here is "not confirmed" and the
// shopper is sent to support. Read fresh at most every 30 seconds (lib/storefront-cache.ts).

const dollars = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`

export type StoreFacts = {
  delivery: { zones: Array<{ name: string; areas: string; rates: Array<{ name: string; price: string; freeAbove: string | null; days: number | null }> }>; freeShippingAbove: string | null }
  payment: { cashOnDelivery: boolean; card: boolean; bankTransfer: string | null; wallet: string | null; note: string }
  returns: { returnDays: string; refundTime: string; damageReportHours: string; pages: string[] }
  contact: { whatsapp: string; email: string; country: string }
}

export async function storeFacts(): Promise<StoreFacts> {
  return storefrontCached('assistant-store-facts', async () => {
    const [zones, threshold, payment, policy, contact] = await Promise.all([
      db.shippingZone.findMany({ where: { isActive: true }, select: { name: true, regions: true, rates: { where: { isActive: true }, select: { name: true, price: true, freeAbove: true, estimatedDays: true } } }, take: 30 }),
      db.setting.findUnique({ where: { key: 'checkout.freeShippingThreshold' } }),
      getPublicPaymentMethods(),
      getPolicyInfo(),
      getContactInfo(),
    ])
    const free = resolveFreeShippingThresholdCents(threshold?.value)
    return {
      delivery: {
        zones: zones.map(z => ({
          name: z.name,
          areas: String(z.regions || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean).slice(0, 25).join(', '),
          rates: z.rates.map(r => ({ name: r.name, price: r.price === 0 ? 'free' : dollars(r.price), freeAbove: r.freeAbove ? dollars(r.freeAbove) : null, days: r.estimatedDays })),
        })),
        freeShippingAbove: free ? dollars(free) : null,
      },
      payment: {
        cashOnDelivery: payment.cod,
        card: payment.card,
        bankTransfer: payment.bank ? (payment.bank.label || 'Bank transfer') : null,
        wallet: payment.wallet ? (payment.wallet.provider || 'Mobile wallet') : null,
        note: 'Account details for transfers are shown at checkout.',
      },
      returns: { ...policy, pages: ['/refund-policy', '/terms-of-service', '/privacy-policy'] },
      contact: { whatsapp: contact.phone, email: contact.email, country: contact.country },
    }
  })
}

export type FaqEntry = { id: string; question: string; questionAr: string | null; answer: string; answerAr: string | null }

export async function activeFaqs(): Promise<FaqEntry[]> {
  return storefrontCached('assistant-faqs', () => db.assistantFaq.findMany({ where: { isActive: true }, select: { id: true, question: true, questionAr: true, answer: true, answerAr: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 100 }))
}

// The FAQ entries that share the most words with the question (English or Arabic), best first.
export function matchFaqs(query: string, faqs: FaqEntry[], limit = 3) {
  const asked = new Set(words(query).filter(w => w.length >= 3))
  if (!asked.size) return []
  return faqs
    .map(f => {
      const text = normalize(`${f.question} ${f.questionAr || ''} ${f.answer.slice(0, 200)}`)
      const hits = [...asked].filter(w => text.includes(w)).length
      return { f, hits }
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map(x => x.f)
}
