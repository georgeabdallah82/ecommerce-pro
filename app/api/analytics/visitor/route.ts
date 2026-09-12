import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { clientIp } from '@/lib/request-ip'
import { randomUUID } from 'crypto'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const SESSION_COOKIE = 'live_visitor_id'
const MAX_PATH = 500

function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : null }
function getCookie(req: Request) { const raw = req.headers.get('cookie') || ''; const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)); return match?.[1] || null }
function setCookie(response: Response, id: string) { response.headers.set('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/; Max-Age=86400; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`) }
function coordinate(value: unknown, min: number, max: number) { const number = typeof value === 'number' ? value : Number(value); return Number.isFinite(number) && number >= min && number <= max ? number : null }

// Cloudflare attaches geolocation to every request via `request.cf` (derived
// from the connecting IP at the edge, no client cooperation needed) -- this
// is what actually powers "where are my visitors" for the ~100% of sessions
// that never see (or decline) the browser GPS consent prompt. The old
// `cf-ipcity`/`cf-ipregion`/`x-vercel-ip-*` headers this used to read are not
// real Cloudflare or Vercel headers, so city/region were always null in
// production; only `cf-ipcountry` is a real header, which is why country was
// the one field that ever worked. getCloudflareContext() can throw outside a
// Workers-compatible runtime, so this is optional and never blocks tracking.
async function geolocate() {
  try {
    const { cf } = await getCloudflareContext({ async: true })
    if (!cf) return null
    return {
      country: clean(cf.country, 80),
      city: clean(cf.city, 120),
      region: clean(cf.region, 120),
      isp: clean(cf.asOrganization, 160),
      latitude: coordinate(cf.latitude, -90, 90),
      longitude: coordinate(cf.longitude, -180, 180),
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = getCookie(req) || randomUUID()
    const path = clean(body.path, MAX_PATH) || '/'
    const referrer = clean(body.referrer, 1000)
    const device = clean(body.device, 40)
    const browser = clean(body.browser, 80)
    const os = clean(body.os, 80)

    const ipAddress = clean(clientIp(req.headers), 64)
    const geo = await geolocate()
    // x-country/x-city/x-region are legacy fallbacks for local dev and any
    // non-Cloudflare deployment target; the geo object above is authoritative
    // whenever it resolved.
    const country = geo?.country ?? clean(req.headers.get('cf-ipcountry') || req.headers.get('x-country'), 80)
    const city = geo?.city ?? clean(req.headers.get('x-city'), 120)
    const region = geo?.region ?? clean(req.headers.get('x-region'), 120)
    const isp = geo?.isp ?? null
    const approxLatitude = geo?.latitude ?? null
    const approxLongitude = geo?.longitude ?? null
    const browserLatitude = coordinate(body.latitude, -90, 90)
    const browserLongitude = coordinate(body.longitude, -180, 180)
    const preciseLocation = body.locationSource === 'browser' && browserLatitude !== null && browserLongitude !== null
    const latitude = preciseLocation ? browserLatitude : null
    const longitude = preciseLocation ? browserLongitude : null

    const user = await getCurrentUser()
    const userId = user?.role === 'CUSTOMER' ? user.id : null
    const now = new Date()

    await db.liveVisitorSession.upsert({
      where: { sessionId },
      create: { id: randomUUID(), sessionId, userId, path, ipAddress, isp, country, city, region, latitude, longitude, approxLatitude, approxLongitude, device, browser, os, referrer, firstSeenAt: now, lastSeenAt: now },
      update: {
        ...(userId ? { userId } : {}), path,
        ...(ipAddress ? { ipAddress } : {}), ...(isp ? { isp } : {}),
        ...(country ? { country } : {}), ...(city ? { city } : {}), ...(region ? { region } : {}),
        latitude, longitude, approxLatitude, approxLongitude,
        ...(device ? { device } : {}), ...(browser ? { browser } : {}), ...(os ? { os } : {}), ...(referrer ? { referrer } : {}),
        lastSeenAt: now,
      },
    })

    await db.liveVisitorSession.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })
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
  if (sessionId) await db.liveVisitorSession.deleteMany({ where: { sessionId } })
  return json({ ok: true })
}
