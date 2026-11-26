import { statusLabel, translator, type Lang } from '@/lib/i18n'
import { whatsappUrl } from '@/lib/links'
import { bestSellers, findProducts, newArrivals, toCard, type CatalogProduct } from './catalog'
import type { ChatReply, QuickAction } from './config'
import { storeFacts } from './knowledge'
import { recentOrdersOf, trackOrder } from './orders'

// The quick-action buttons and every answer given without Claude (when it is switched off, out of
// today's budget or unavailable): built only from the store's own data, so they cost nothing.

export const emptyReply = (text: string): ChatReply => ({ text, products: [], orders: [], support: null, form: null })
const cards = (list: CatalogProduct[]) => list.map(toCard)

export async function supportCard(lang: Lang, note: { supportNote: string; supportNoteAr: string }) {
  const facts = await storeFacts()
  const t = translator(lang)
  return {
    // A wa.me link, or empty when the store has no phone number set.
    whatsapp: whatsappUrl(facts.contact.whatsapp, facts.contact.country),
    email: facts.contact.email,
    note: (lang === 'ar' ? note.supportNoteAr || note.supportNote : note.supportNote) || t('Our team will reply as soon as they can.'),
  }
}

async function deliveryText(lang: Lang) {
  const t = translator(lang)
  const { delivery } = await storeFacts()
  const lines: string[] = []
  for (const zone of delivery.zones.slice(0, 6)) {
    const rates = zone.rates.map(r => {
      const price = r.price === 'free' ? t('Free') : r.price
      const days = r.days ? ` (${t('{n} days', { n: r.days })})` : ''
      return `${r.name}: ${price}${days}`
    })
    if (rates.length) lines.push(`• ${zone.name}${zone.areas ? ` – ${zone.areas}` : ''}\n  ${rates.join(', ')}`)
  }
  if (!lines.length) return t('Delivery details are shown at checkout once you enter your address.')
  const free = delivery.freeShippingAbove ? `\n${t('Free delivery on orders above {amount}.', { amount: delivery.freeShippingAbove })}` : ''
  return `${t('Here is how delivery works:')}\n${lines.join('\n')}${free}`
}

export async function quickAction(action: QuickAction, lang: Lang, ctx: { userId: string | null; supportNote: string; supportNoteAr: string }): Promise<ChatReply> {
  const t = translator(lang)
  switch (action) {
    case 'find_product':
      return emptyReply(t('What are you looking for? Tell me the item, your budget or who it is for, and I will find the best matches.'))
    case 'best_sellers': {
      const list = await bestSellers(4)
      if (list.length) return { ...emptyReply(t('Our best sellers right now:')), products: cards(list) }
      return { ...emptyReply(t('Here are some of our newest products:')), products: cards(await newArrivals(4)) }
    }
    case 'new_arrivals': {
      const list = await newArrivals(4)
      return list.length ? { ...emptyReply(t('Just arrived:')), products: cards(list) } : emptyReply(t('No new products right now. Check back soon!'))
    }
    case 'track_order': {
      if (ctx.userId) {
        const orders = await recentOrdersOf(ctx.userId)
        if (orders.length) {
          return {
            ...emptyReply(t('Here are your latest orders. Open one to see its details, or enter another order number below.')),
            orders: orders.map(o => ({ orderNumber: o.orderNumber, status: statusLabel(t, o.status), placedAt: o.placedAt, link: `/account/orders/${encodeURIComponent(o.orderNumber)}` })),
            form: 'track_order',
          }
        }
      }
      return { ...emptyReply(t('Enter your order number and the phone number or email you used for the order.')), form: 'track_order' }
    }
    case 'delivery_info':
      return emptyReply(await deliveryText(lang))
    case 'support':
      return { ...emptyReply(t('Our team is happy to help. Reach us here:')), support: await supportCard(lang, ctx) }
  }
}

// The order form under "Track my order".
export async function trackOrderReply(input: { orderNumber: unknown; contact: unknown }, lang: Lang, who: { userId: string | null; ip: string }): Promise<ChatReply> {
  const t = translator(lang)
  const result = await trackOrder(input, who)
  if (!result.ok) {
    const text = {
      invalid: t('Please check the order number. It is on your receipt and confirmation message, like ORD-1042.'),
      need_contact: t('Please also enter the phone number or email you used for the order.'),
      not_found: t('We could not find an order with that number and phone number or email. Please check both and try again.'),
      too_many: t('Too many attempts. Please try again later.'),
    }[result.reason]
    return { ...emptyReply(text), form: 'track_order' }
  }
  const o = result.order
  const lines = [t('Order {number}: {status}', { number: o.orderNumber, status: statusLabel(t, o.status) })]
  if (o.status === 'SHIPPED' && o.shippedEtaMinutes != null) lines.push(t('On its way, about {n} minutes away.', { n: o.shippedEtaMinutes }))
  else if (o.status === 'SHIPPED') lines.push(t('Your order is on its way.'))
  return { ...emptyReply(lines.join('\n')), orders: [{ orderNumber: o.orderNumber, status: statusLabel(t, o.status), placedAt: o.placedAt, link: o.link }] }
}

// A typed message when Claude can't answer: the store's own search.
export async function searchFallback(message: string, lang: Lang, support: { supportNote: string; supportNoteAr: string }): Promise<{ reply: ChatReply; found: boolean }> {
  const t = translator(lang)
  const found = await findProducts({ query: message.slice(0, 120), limit: 4 }).catch(() => [])
  if (found.length) return { reply: { ...emptyReply(t('Here is what I found:')), products: cards(found) }, found: true }
  return {
    reply: { ...emptyReply(t('I could not find that. Try other words, pick an option below, or contact our team.')), support: await supportCard(lang, support) },
    found: false,
  }
}
