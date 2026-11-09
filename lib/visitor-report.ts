import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import { startOfStoreDay } from '@/lib/store-day'
import { LIVE_WINDOW_MS, STAGE_LABELS, describePath, stageOf, type Stage } from '@/lib/visitor-tracking'
import { agentLabel } from '@/lib/visitor-agent'
import { sourceLabel } from '@/lib/visitor-source'
import { placeLine } from '@/lib/checkout-place'
import { formatDuration, funnelToday, hourlyCounts, onlineSummary, pagesPerVisit, percent, topCounts, type CountRow, type FunnelRow } from '@/lib/visitor-stats'

// What Admin > Live visitors shows (app/api/admin/visitors). Rules: lib/visitor-tracking.ts.

const MAX_ONLINE = 100
const MAX_TODAY_ROWS = 5000

export type OnlineRow = {
  id: string
  page: string
  stage: Stage
  stageLabel: string
  place: string
  source: string
  agent: string
  onSite: string
  pageViews: number
  cartItems: number
  cartValue: number
  cameBefore: boolean
  name: string | null
  // Approximate (rounded to about 10 km): a dot on the map, never a street.
  lat: number | null
  lng: number | null
}

// A shopper who left checkout unfinished and shared an exact spot (only staff who may see unfinished
// checkouts get these).
export type PinRow = { id: string; name: string; place: string; lat: number; lng: number; accuracy: number | null; minutesAgo: number; subtotal: number }

export type LiveReport = {
  generatedAt: string
  windowSeconds: number
  online: number
  byStage: Record<Stage, number>
  withCart: number
  cartValue: number
  currency: string
  visitors: OnlineRow[]
  pins: PinRow[]
}

// Names for pages: products and collections by their address, everything else by a fixed name.
async function pageNames(paths: string[]) {
  const infos = paths.map(path => ({ path, info: describePath(path) }))
  const productSlugs = [...new Set(infos.filter(i => i.info.kind === 'product').map(i => i.info.slug!))]
  const collectionSlugs = [...new Set(infos.filter(i => i.info.kind === 'collection').map(i => i.info.slug!))]
  const [products, collections] = await Promise.all([
    productSlugs.length ? db.product.findMany({ where: { slug: { in: productSlugs } }, select: { slug: true, name: true } }) : [],
    collectionSlugs.length ? db.collection.findMany({ where: { slug: { in: collectionSlugs } }, select: { slug: true, name: true } }) : [],
  ])
  const productName = new Map(products.map(p => [p.slug, p.name]))
  const collectionName = new Map(collections.map(c => [c.slug, c.name]))
  return (path: string) => {
    const info = describePath(path)
    if (info.kind === 'product') return productName.get(info.slug!) || 'A product'
    if (info.kind === 'collection') return collectionName.get(info.slug!) || 'A collection'
    return info.label
  }
}

const placeOf = (v: { city: string | null; country: string | null }) => [v.city, v.country].filter(Boolean).join(', ') || 'Location unknown'

export async function liveReport(now = new Date(), options: { pins?: boolean } = {}): Promise<LiveReport> {
  const [rows, currency, pinRows] = await Promise.all([
    db.visitorSession.findMany({
      where: { lastSeenAt: { gte: new Date(now.getTime() - LIVE_WINDOW_MS) }, leftAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: MAX_ONLINE,
    }),
    getStoreCurrency().catch(() => 'USD'),
    options.pins
      ? db.abandonedCheckout.findMany({
        where: { status: 'OPEN', pinLat: { not: null }, pinLng: { not: null }, lastActivity: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
        select: { id: true, name: true, city: true, area: true, pinLat: true, pinLng: true, pinAccuracy: true, subtotal: true, lastActivity: true },
        orderBy: { lastActivity: 'desc' },
        take: 50,
      })
      : Promise.resolve([]),
  ])
  const userIds = [...new Set(rows.map(v => v.userId).filter((id): id is string => !!id))]
  const [users, nameOf] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    pageNames(rows.map(v => v.path)),
  ])
  const names = new Map(users.map(u => [u.id, u.name]))
  const visitors: OnlineRow[] = rows.map(v => {
    // The step shown is where the visitor is NOW (their current page), not the furthest they have been.
    const stage = stageOf(v.path)
    return {
      id: v.id,
      page: nameOf(v.path),
      stage,
      stageLabel: STAGE_LABELS[stage],
      place: placeOf(v),
      source: sourceLabel(v.source, v.referrerHost),
      agent: agentLabel(v),
      onSite: formatDuration(now.getTime() - v.startedAt.getTime()),
      pageViews: v.pageViews,
      cartItems: v.cartItems,
      cartValue: v.cartValue,
      cameBefore: v.cameBefore,
      name: v.userId ? names.get(v.userId) || null : null,
      lat: v.placeLat,
      lng: v.placeLng,
    }
  })
  const summary = onlineSummary(visitors)
  const pins: PinRow[] = pinRows.flatMap(p => p.pinLat === null || p.pinLng === null ? [] : [{
    id: p.id,
    name: p.name || 'No name given',
    place: placeLine(p) || 'Area not given',
    lat: p.pinLat,
    lng: p.pinLng,
    accuracy: p.pinAccuracy,
    minutesAgo: Math.max(0, Math.round((now.getTime() - p.lastActivity.getTime()) / 60000)),
    subtotal: p.subtotal,
  }])
  return { generatedAt: now.toISOString(), windowSeconds: LIVE_WINDOW_MS / 1000, ...summary, currency, visitors, pins }
}

export type TodayReport = {
  generatedAt: string
  dayStart: string
  timezone: string
  currency: string
  visitors: number
  pageViews: number
  pagesPerVisit: string
  returningPercent: number
  ordersToday: number
  salesToday: number
  conversionPercent: number
  hourly: number[]
  funnel: FunnelRow[]
  topPages: Array<{ path: string; title: string; views: number }>
  sources: Array<CountRow & { label: string; percent: number }>
  devices: Array<CountRow & { percent: number }>
  truncated: boolean
}

export async function todayReport(now = new Date()): Promise<TodayReport> {
  const [timezone, currency] = await Promise.all([getStoreTimezone().catch(() => 'Asia/Beirut'), getStoreCurrency().catch(() => 'USD')])
  const dayStart = startOfStoreDay(now, timezone)
  const [visitorCount, orderedVisits, pageViews, sessions, topPaths, orders] = await Promise.all([
    db.visitorSession.count({ where: { startedAt: { gte: dayStart } } }),
    db.visitorSession.count({ where: { startedAt: { gte: dayStart }, reached: { gte: 4 } } }),
    db.visitorPageView.count({ where: { at: { gte: dayStart } } }),
    db.visitorSession.findMany({
      where: { startedAt: { gte: dayStart } },
      select: { startedAt: true, reached: true, cameBefore: true, source: true, referrerHost: true, device: true },
      orderBy: { startedAt: 'desc' },
      take: MAX_TODAY_ROWS,
    }),
    db.visitorPageView.groupBy({ by: ['path'], where: { at: { gte: dayStart } }, _count: { path: true }, orderBy: { _count: { path: 'desc' } }, take: 8 }),
    db.order.aggregate({ where: { createdAt: { gte: dayStart }, status: { not: 'CANCELLED' } }, _count: { _all: true }, _sum: { grandTotal: true } }),
  ])
  const nameOf = await pageNames(topPaths.map(p => p.path))
  const total = sessions.length
  const sourceRows = topCounts(sessions.map(s => (s.source === 'other' && s.referrerHost ? `other:${s.referrerHost}` : s.source)), 6, 'direct')
  const ordersToday = orders._count._all
  return {
    generatedAt: now.toISOString(),
    dayStart: dayStart.toISOString(),
    timezone,
    currency,
    visitors: visitorCount,
    pageViews,
    pagesPerVisit: pagesPerVisit(pageViews, visitorCount),
    returningPercent: percent(sessions.filter(s => s.cameBefore).length, total),
    ordersToday,
    salesToday: orders._sum.grandTotal || 0,
    // Share of today's visits that placed an order (orders taken by phone or WhatsApp are not visits).
    conversionPercent: visitorCount ? Math.round((orderedVisits / visitorCount) * 1000) / 10 : 0,
    hourly: hourlyCounts(sessions.map(s => s.startedAt), timezone),
    funnel: funnelToday(sessions.map(s => s.reached)),
    topPages: topPaths.map(p => ({ path: p.path, title: nameOf(p.path), views: p._count.path })),
    sources: sourceRows.map(r => ({ ...r, label: r.key.startsWith('other:') ? r.key.slice(6) : sourceLabel(r.key), percent: percent(r.count, total) })),
    devices: topCounts(sessions.map(s => s.device), 3, 'unknown').map(r => ({ ...r, percent: percent(r.count, total) })),
    truncated: visitorCount > MAX_TODAY_ROWS,
  }
}

// The two numbers on the dashboard.
export async function visitorCounts(now = new Date()) {
  const timezone = await getStoreTimezone().catch(() => 'Asia/Beirut')
  const dayStart = startOfStoreDay(now, timezone)
  const [online, today, ordered] = await Promise.all([
    db.visitorSession.count({ where: { lastSeenAt: { gte: new Date(now.getTime() - LIVE_WINDOW_MS) }, leftAt: null } }),
    db.visitorSession.count({ where: { startedAt: { gte: dayStart } } }),
    db.visitorSession.count({ where: { startedAt: { gte: dayStart }, reached: { gte: 4 } } }),
  ])
  return { online, today, ordered }
}
