import { randomUUID } from 'node:crypto'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { db } from '@/lib/prisma'
import { parseAgent } from '@/lib/visitor-agent'
import { visitorSource } from '@/lib/visitor-source'
import { MAX_PATH, PAGEVIEW_RETENTION_DAYS, SESSION_RETENTION_DAYS, stageOf, stageRank } from '@/lib/visitor-tracking'
import type { VisitInput } from '@/lib/visit-input'
import { roundPlace } from '@/lib/visitor-map'

// Recording visits (app/api/analytics/visit). Rules: lib/visitor-tracking.ts; reading the request: lib/visit-input.ts.

// Cloudflare tells the Worker roughly where a request comes from (country, city) from its address;
// the address itself is never kept.
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

async function place(headers: Headers) {
  try {
    const { cf } = await getCloudflareContext({ async: true })
    if (cf) {
      // The network's rough position, rounded to about 10 km before it is kept (lib/visitor-map.ts).
      const rough = roundPlace(cf.latitude, cf.longitude)
      return { country: clean(cf.country, 80) || null, city: clean(cf.city, 120) || null, region: clean(cf.region, 120) || null, placeLat: rough?.lat ?? null, placeLng: rough?.lng ?? null }
    }
  } catch {}
  const country = clean(headers.get('cf-ipcountry') || headers.get('x-country'), 80)
  return { country: country && country !== 'XX' && country !== 'T1' ? country : null, city: clean(headers.get('x-city'), 120) || null, region: clean(headers.get('x-region'), 120) || null, placeLat: null, placeLng: null }
}

export type VisitResult = { sid: string; created: boolean }

export async function recordVisit(input: VisitInput, ctx: { sid: string | null; cameBefore: boolean; headers: Headers; ownHost: string; userId: string | null; now?: Date }): Promise<VisitResult | null> {
  const now = ctx.now || new Date()
  const agent = parseAgent(ctx.headers.get('user-agent'))
  if (agent.bot) return null

  if (input.kind === 'leave') {
    if (ctx.sid) await db.visitorSession.updateMany({ where: { sid: ctx.sid }, data: { leftAt: now } })
    return ctx.sid ? { sid: ctx.sid, created: false } : null
  }

  if (input.kind === 'ping' && ctx.sid) {
    const updated = await db.visitorSession.updateMany({ where: { sid: ctx.sid }, data: { lastSeenAt: now, leftAt: null, cartItems: input.cartItems, cartValue: input.cartValue } })
    if (updated.count) return { sid: ctx.sid, created: false }
    // The visit is gone (deleted, or never saved): start it again below.
  }

  const sid = ctx.sid || randomUUID().replace(/-/g, '')
  const path = input.path.slice(0, MAX_PATH)
  const reached = stageRank(stageOf(path))
  const source = visitorSource({ referrer: input.referrer, landing: input.landing, ownHost: ctx.ownHost })
  const where = await place(ctx.headers)
  const iso = now.toISOString()
  // One statement: a new visit is created; an existing one gets its latest page, one more page view
  // and the furthest step reached (never a step back).
  await Promise.all([
    db.$executeRaw`INSERT INTO "VisitorSession" ("id", "sid", "startedAt", "lastSeenAt", "landingPath", "path", "pageViews", "reached", "cartItems", "cartValue", "source", "referrerHost", "country", "city", "region", "placeLat", "placeLng", "device", "browser", "os", "cameBefore", "userId")
      VALUES (${randomUUID().replace(/-/g, '')}, ${sid}, ${iso}::timestamp, ${iso}::timestamp, ${path}, ${path}, 1, ${reached}, ${input.cartItems}, ${input.cartValue}, ${source.key}, ${source.host}, ${where.country}, ${where.city}, ${where.region}, ${where.placeLat}, ${where.placeLng}, ${agent.device}, ${agent.browser}, ${agent.os}, ${ctx.cameBefore}, ${ctx.userId})
      ON CONFLICT ("sid") DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt", "leftAt" = NULL, "path" = EXCLUDED."path", "pageViews" = "VisitorSession"."pageViews" + 1,
        "reached" = GREATEST("VisitorSession"."reached", EXCLUDED."reached"), "cartItems" = EXCLUDED."cartItems", "cartValue" = EXCLUDED."cartValue", "placeLat" = COALESCE(EXCLUDED."placeLat", "VisitorSession"."placeLat"), "placeLng" = COALESCE(EXCLUDED."placeLng", "VisitorSession"."placeLng"), "userId" = COALESCE(EXCLUDED."userId", "VisitorSession"."userId")`,
    db.visitorPageView.create({ data: { sid, path, at: now } }),
  ])
  return { sid, created: !ctx.sid }
}

// Old visits and page views are deleted (run by the daily job).
export async function pruneVisitorData(now = new Date()) {
  const day = 24 * 60 * 60 * 1000
  const [sessions, views] = await Promise.all([
    db.visitorSession.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - SESSION_RETENTION_DAYS * day) } } }),
    db.visitorPageView.deleteMany({ where: { at: { lt: new Date(now.getTime() - PAGEVIEW_RETENTION_DAYS * day) } } }),
  ])
  return { sessions: sessions.count, views: views.count }
}
