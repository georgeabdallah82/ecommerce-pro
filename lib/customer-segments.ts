import { db } from '@/lib/prisma'
import { sumCustomerSpend } from '@/lib/orders'
import { OrderStatus, Role } from '@prisma/client'

const FIELDS = ['totalSpent', 'orderCount', 'lastOrderDaysAgo', 'accountAgeDays', 'tag'] as const
const OPERATORS = ['gte', 'lte', 'gt', 'lt', 'eq'] as const
export type SegmentField = (typeof FIELDS)[number]
export type SegmentOperator = (typeof OPERATORS)[number]
export type SegmentCondition = { field: SegmentField; operator: SegmentOperator; value: number | string }
export type SegmentRules = { conditions: SegmentCondition[] }

function isValidCondition(c: unknown): c is SegmentCondition {
  const cond = c as any
  return !!cond && typeof cond === 'object'
    && FIELDS.includes(cond.field) && OPERATORS.includes(cond.operator)
    && (typeof cond.value === 'number' || typeof cond.value === 'string')
}

// A segment with no conditions (the {} every segment was created with before this feature
// existed, and still the default for a purely manual segment) never auto-matches anyone --
// rule-based membership is opt-in per segment, not the default for every row in the table.
export function parseSegmentRules(ruleJson: string): SegmentRules {
  try {
    const parsed = JSON.parse(ruleJson)
    if (Array.isArray(parsed?.conditions)) return { conditions: parsed.conditions.filter(isValidCondition).slice(0, 10) }
  } catch { /* fall through to empty */ }
  return { conditions: [] }
}

function compare(actual: number | string | null, operator: SegmentOperator, expected: number | string): boolean {
  if (actual === null) return false
  if (operator === 'eq') return String(actual) === String(expected)
  if (typeof actual !== 'number' || typeof expected !== 'number') return false
  if (operator === 'gte') return actual >= expected
  if (operator === 'lte') return actual <= expected
  if (operator === 'gt') return actual > expected
  return actual < expected
}

export type CustomerStats = { totalSpent: number; orderCount: number; lastOrderDaysAgo: number | null; accountAgeDays: number; tags: string[] }

export function matchesSegmentRules(rules: SegmentRules, stats: CustomerStats): boolean {
  if (!rules.conditions.length) return false
  return rules.conditions.every(cond => cond.field === 'tag' ? stats.tags.includes(String(cond.value)) : compare(stats[cond.field], cond.operator, cond.value))
}

// Bulk-computes every customer's stats the same way the customers list already does (see
// app/api/admin/customers/route.ts) -- orders fetched separately and grouped per customer
// rather than a nested Prisma include, since sumCustomerSpend needs each order's
// paymentTransactions to net out refunds and a plain SQL sum can't do that.
async function computeAllCustomerStats(): Promise<Map<string, CustomerStats>> {
  const customers = await db.user.findMany({ where: { role: Role.CUSTOMER }, select: { id: true, createdAt: true } })
  const ids = customers.map(c => c.id)
  const [orders, tagMembers] = await Promise.all([
    ids.length ? db.order.findMany({ where: { userId: { in: ids }, status: { not: OrderStatus.CANCELLED } }, select: { userId: true, status: true, grandTotal: true, createdAt: true, paymentTransactions: { select: { status: true, amount: true } } } }) : Promise.resolve([]),
    ids.length ? db.customerTagMember.findMany({ where: { customerId: { in: ids } }, include: { tag: true } }) : Promise.resolve([]),
  ])
  const ordersByCustomer = new Map<string, typeof orders>()
  for (const order of orders as any[]) {
    if (!order.userId) continue
    const list = ordersByCustomer.get(order.userId) || []
    list.push(order)
    ordersByCustomer.set(order.userId, list)
  }
  const tagsByCustomer = new Map<string, string[]>()
  for (const member of tagMembers as any[]) {
    if (!member.tag?.value) continue
    const list = tagsByCustomer.get(member.customerId) || []
    list.push(member.tag.value)
    tagsByCustomer.set(member.customerId, list)
  }
  const now = Date.now()
  const stats = new Map<string, CustomerStats>()
  for (const customer of customers) {
    const customerOrders = ordersByCustomer.get(customer.id) || []
    const lastOrder = customerOrders.reduce<Date | null>((latest, o: any) => (!latest || o.createdAt > latest ? o.createdAt : latest), null)
    stats.set(customer.id, {
      totalSpent: sumCustomerSpend(customerOrders as any),
      orderCount: customerOrders.length,
      lastOrderDaysAgo: lastOrder ? Math.floor((now - new Date(lastOrder).getTime()) / 86400000) : null,
      accountAgeDays: Math.floor((now - new Date(customer.createdAt).getTime()) / 86400000),
      tags: tagsByCustomer.get(customer.id) || [],
    })
  }
  return stats
}

// Adds every rule-matching customer as a segment member. Additive/non-destructive -- never
// removes an existing member, whether they were assigned manually from the customer profile
// or matched by an earlier recompute, so a rule-based segment only ever grows automatically;
// staff remove someone who no longer belongs by hand, the same way membership is already
// managed today. Returns how many new members this run added.
export async function recomputeSegmentMembership(segmentId: string): Promise<number> {
  const segment = await db.customerSegment.findUnique({ where: { id: segmentId } })
  if (!segment) throw new Error('Segment not found')
  const rules = parseSegmentRules(segment.ruleJson)
  if (!rules.conditions.length) return 0

  const statsByCustomer = await computeAllCustomerStats()
  let added = 0
  for (const [customerId, stats] of statsByCustomer) {
    if (!matchesSegmentRules(rules, stats)) continue
    const existing = await db.customerSegmentMember.findUnique({ where: { segmentId_customerId: { segmentId, customerId } } })
    if (existing) continue
    await db.customerSegmentMember.create({ data: { segmentId, customerId } })
    added++
  }
  return added
}
