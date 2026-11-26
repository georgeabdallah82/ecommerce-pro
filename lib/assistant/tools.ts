import type Anthropic from '@anthropic-ai/sdk'
import { activeCollections, findProducts, productById, productForModel, similarProducts, type CatalogProduct, type ProductQuery } from './catalog'
import { activeFaqs, matchFaqs, storeFacts } from './knowledge'
import { recentOrdersOf, trackOrder } from './orders'

// The only things Claude can do in the chat: read the shop's products, settings, FAQ and (with the
// store's usual checks) one order. Every tool is read-only and runs on the server with the shopper's
// own session and limits; nothing Claude writes is trusted as a fact without coming from here.

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description: "Search the store's catalogue. Use for any product question: what the shopper wants, budget, category, sale items, best sellers or new arrivals. Returns at most 8 products with real prices and availability. Leave query empty to browse by filters or sort only.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to search for, in any language (e.g. "red dress", "عطر"). Leave empty to browse.' },
        min_price: { type: 'number', description: 'Lowest price in the store currency (dollars).' },
        max_price: { type: 'number', description: 'Highest price in the store currency (dollars).' },
        collection: { type: 'string', description: 'A collection slug from list_collections.' },
        in_stock_only: { type: 'boolean' },
        on_sale: { type: 'boolean', description: 'Only products with a reduced price.' },
        sort: { type: 'string', enum: ['relevance', 'price_low', 'price_high', 'newest', 'best_selling'] },
      },
    },
  },
  {
    name: 'get_product',
    description: 'Full details of one product (description, options, availability, price) by its id from a search result.',
    input_schema: { type: 'object', properties: { product_id: { type: 'string' } }, required: ['product_id'] },
  },
  {
    name: 'similar_products',
    description: 'Products similar to one product (same collections, type or tags, similar price), in stock.',
    input_schema: { type: 'object', properties: { product_id: { type: 'string' } }, required: ['product_id'] },
  },
  {
    name: 'list_collections',
    description: "The store's categories (collections), with slugs for search_products.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'store_info',
    description: "The store's own settings for delivery (zones, areas, prices, free delivery), payment methods, returns and refunds, and contact details. Only these facts may be stated about these topics.",
    input_schema: { type: 'object', properties: { topic: { type: 'string', enum: ['delivery', 'payment', 'returns', 'contact'] } }, required: ['topic'] },
  },
  {
    name: 'search_faq',
    description: "The store owner's answers to common questions. Check here before saying something about the store is not confirmed.",
    input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
  },
  {
    name: 'track_order',
    description: "Status of one order. Needs the order number and, unless the shopper is signed in as the person who placed it, the phone number or email used for the order. Ask the shopper for what is missing; never guess. If the shopper is signed in and gives no number, call with order_number empty to list their latest orders.",
    input_schema: {
      type: 'object',
      properties: {
        order_number: { type: 'string', description: 'As printed on the receipt, e.g. ORD-1042.' },
        contact: { type: 'string', description: 'The phone number or email the order was placed with.' },
      },
    },
  },
]

export type ToolContext = {
  userId: string | null
  ip: string
  // Every product a tool returned in this answer: only these can be shown as cards.
  seen: Map<string, CatalogProduct>
  searches: string[]
  orderLinks: Array<{ orderNumber: string; link: string; status: string; placedAt: string }>
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined)
const str = (value: unknown, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const SORTS = ['relevance', 'price_low', 'price_high', 'newest', 'best_selling'] as const

function remember(ctx: ToolContext, products: CatalogProduct[]) {
  for (const p of products) ctx.seen.set(p.id, p)
  return products
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case 'search_products': {
      const sort = SORTS.find(s => s === input.sort)
      const min = num(input.min_price)
      const max = num(input.max_price)
      const query: ProductQuery = {
        query: str(input.query),
        minPrice: min != null ? Math.round(min * 100) : undefined,
        maxPrice: max != null ? Math.round(max * 100) : undefined,
        collection: str(input.collection, 80),
        inStockOnly: input.in_stock_only === true,
        onSale: input.on_sale === true,
        sort,
        limit: 8,
      }
      if (query.query) ctx.searches.push(query.query)
      const found = remember(ctx, await findProducts(query))
      return { count: found.length, products: found.map(p => productForModel(p)) }
    }
    case 'get_product': {
      const p = await productById(str(input.product_id, 80))
      if (!p) return { error: 'No product with that id.' }
      remember(ctx, [p])
      return productForModel(p, true)
    }
    case 'similar_products': {
      const found = remember(ctx, await similarProducts(str(input.product_id, 80), 4))
      return { count: found.length, products: found.map(p => productForModel(p)) }
    }
    case 'list_collections':
      return { collections: (await activeCollections()).map(c => ({ name: c.name, slug: c.slug })) }
    case 'store_info': {
      const facts = await storeFacts()
      const topic = str(input.topic, 20)
      if (topic === 'delivery') return facts.delivery
      if (topic === 'payment') return facts.payment
      if (topic === 'returns') return facts.returns
      if (topic === 'contact') return facts.contact
      return { error: 'Unknown topic.' }
    }
    case 'search_faq': {
      const hits = matchFaqs(str(input.question, 300), await activeFaqs(), 3)
      return hits.length ? { answers: hits.map(f => ({ question: f.question, answer: f.answer, ...(f.answerAr ? { answer_ar: f.answerAr } : {}) })) } : { answers: [], note: 'No answer in the FAQ.' }
    }
    case 'track_order': {
      const orderNumber = str(input.order_number, 60)
      if (!orderNumber) {
        if (!ctx.userId) return { error: 'need_order_number', note: 'Ask the shopper for the order number and the phone number or email used for the order.' }
        return { orders: await recentOrdersOf(ctx.userId) }
      }
      const result = await trackOrder({ orderNumber, contact: str(input.contact, 254) }, { userId: ctx.userId, ip: ctx.ip })
      if (!result.ok) {
        const notes = {
          need_contact: 'Ask for the phone number or email the order was placed with.',
          not_found: 'No order matches that number and contact. Ask the shopper to check both; do not say whether the number exists.',
          too_many: 'Too many attempts. Ask the shopper to try again later or contact support.',
          invalid: 'That does not look like an order number. Ask the shopper to check it.',
        }
        return { error: result.reason, note: notes[result.reason] }
      }
      ctx.orderLinks.push({ orderNumber: result.order.orderNumber, link: result.order.link, status: result.order.status, placedAt: result.order.placedAt })
      const { link: _link, ...order } = result.order
      return { ...order, note: 'The shopper sees a button to the order page under your answer.' }
    }
    default:
      return { error: 'Unknown tool.' }
  }
}
