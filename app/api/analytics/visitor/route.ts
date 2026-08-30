import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { randomUUID } from 'crypto'

const SESSION_COOKIE = 'live_visitor_id'
const MAX_PATH = 500

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : null
}

function getCookie(req: Request) {
  const raw = req.headers.get('cookie') || ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  return match?.[1] || null
}

function setCookie(response: Response, id: string) {
  response.headers.set('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/; Max-Age=86400; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = getCookie(req) || randomUUID()
    const path = clean(body.path, MAX_PATH) || '/'
    const referrer = clean(body.referrer, 1000)
    const userAgent = clean(req.headers.get('user-agent'), 500)
    const device = clean(body.device, 40)
    const browser = clean(body.browser, 80)
    const os = clean(body.os, 80)

    const country = clean(req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry') || req.headers.get('x-country'), 80)
    const city = clean(req.headers.get('x-vercel-ip-city') || req.headers.get('cf-ipcity') || req.headers.get('x-city'), 120)
    const region = clean(req.headers.get('x-vercel-ip-country-region') || req.headers.get('x-region'), 120)
    const latRaw = req.headers.get('x-vercel-ip-latitude') || req.headers.get('x-latitude')
    const lonRaw = req.headers.get('x-vercel-ip-longitude') || req.headers.get('x-longitude')
    const latitude = latRaw && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null
    const longitude = lonRaw && Number.isFinite(Number(lonRaw)) ? Number(lonRaw) : null
    const user = await getCurrentUser()
    const userId = user?.role === 'CUSTOMER' ? user.id : null
    const now = new Date()

    await db.liveVisitorSession.upsert({
      where: { sessionId },
      create: {
        id: randomUUID(),
        sessionId,
        userId,
        path,
        country,
        city,
        region,
        latitude,
        longitude,
        device,
        browser,
        os,
        referrer,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        ...(userId ? { userId } : {}),
        path,
        ...(country ? { country } : {}),
        ...(city ? { city } : {}),
        ...(region ? { region } : {}),
        ...(latitude !== null ? { latitude } : {}),
        ...(longitude !== null ? { longitude } : {}),
        ...(device ? { device } : {}),
        ...(browser ? { browser } : {}),
        ...(os ? { os } : {}),
        ...(referrer ? { referrer } : {}),
        lastSeenAt: now,
      },
    })

    await db.liveVisitorSession.deleteMany({
      where: { lastSeenAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    })

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
