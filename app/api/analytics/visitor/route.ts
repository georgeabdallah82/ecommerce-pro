import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { randomUUID } from 'crypto'

const SESSION_COOKIE = 'live_visitor_id'
const MAX_PATH = 500

function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : null }
function getCookie(req: Request) { const raw = req.headers.get('cookie') || ''; const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)); return match?.[1] || null }
function setCookie(response: Response, id: string) { response.headers.set('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/; Max-Age=86400; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`) }
function coordinate(value: unknown, min: number, max: number) { const number = typeof value === 'number' ? value : Number(value); return Number.isFinite(number) && number >= min && number <= max ? number : null }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = getCookie(req) || randomUUID()
    const path = clean(body.path, MAX_PATH) || '/'
    const referrer = clean(body.referrer, 1000)
    const device = clean(body.device, 40)
    const browser = clean(body.browser, 80)
    const os = clean(body.os, 80)

    const country = clean(req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry') || req.headers.get('x-country'), 80)
    const city = clean(req.headers.get('x-vercel-ip-city') || req.headers.get('cf-ipcity') || req.headers.get('x-city'), 120)
    const region = clean(req.headers.get('x-vercel-ip-country-region') || req.headers.get('x-region'), 120)
    const proxyLatitude = coordinate(req.headers.get('x-vercel-ip-latitude') || req.headers.get('x-latitude'), -90, 90)
    const proxyLongitude = coordinate(req.headers.get('x-vercel-ip-longitude') || req.headers.get('x-longitude'), -180, 180)
    const browserLatitude = coordinate(body.latitude, -90, 90)
    const browserLongitude = coordinate(body.longitude, -180, 180)
    const browserLocation = body.locationSource === 'browser' && browserLatitude !== null && browserLongitude !== null
    const latitude = browserLocation ? browserLatitude : proxyLatitude
    const longitude = browserLocation ? browserLongitude : proxyLongitude
    const locationSource = browserLocation ? 'browser' : (proxyLatitude !== null && proxyLongitude !== null ? 'proxy' : null)

    const user = await getCurrentUser()
    const userId = user?.role === 'CUSTOMER' ? user.id : null
    const now = new Date()

    await db.$executeRaw`
      INSERT INTO "LiveVisitorSession" ("id", "sessionId", "userId", "path", "country", "city", "region", "latitude", "longitude", "locationSource", "device", "browser", "os", "referrer", "firstSeenAt", "lastSeenAt")
      VALUES (${randomUUID()}, ${sessionId}, ${userId}, ${path}, ${country}, ${city}, ${region}, ${latitude}, ${longitude}, ${locationSource}, ${device}, ${browser}, ${os}, ${referrer}, ${now}, ${now})
      ON CONFLICT ("sessionId") DO UPDATE SET
        "userId" = COALESCE(EXCLUDED."userId", "LiveVisitorSession"."userId"),
        "path" = EXCLUDED."path",
        "country" = COALESCE(EXCLUDED."country", "LiveVisitorSession"."country"),
        "city" = COALESCE(EXCLUDED."city", "LiveVisitorSession"."city"),
        "region" = COALESCE(EXCLUDED."region", "LiveVisitorSession"."region"),
        "latitude" = COALESCE(EXCLUDED."latitude", "LiveVisitorSession"."latitude"),
        "longitude" = COALESCE(EXCLUDED."longitude", "LiveVisitorSession"."longitude"),
        "locationSource" = COALESCE(EXCLUDED."locationSource", "LiveVisitorSession"."locationSource"),
        "device" = COALESCE(EXCLUDED."device", "LiveVisitorSession"."device"),
        "browser" = COALESCE(EXCLUDED."browser", "LiveVisitorSession"."browser"),
        "os" = COALESCE(EXCLUDED."os", "LiveVisitorSession"."os"),
        "referrer" = COALESCE(EXCLUDED."referrer", "LiveVisitorSession"."referrer"),
        "lastSeenAt" = EXCLUDED."lastSeenAt"
    `

    await db.$executeRaw`DELETE FROM "LiveVisitorSession" WHERE "lastSeenAt" < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`
    const response = json({ ok: true, sessionId })
    setCookie(response, sessionId)
    return response
  } catch (error) {
    console.error('[analytics/visitor] failure', error)
    return json({ error: 'Unable to record visitor session' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const sessionId = getCookie(req)
  if (sessionId) await db.$executeRaw`DELETE FROM "LiveVisitorSession" WHERE "sessionId" = ${sessionId}`
  return json({ ok: true })
}
