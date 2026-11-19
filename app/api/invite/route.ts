import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { getSellingConfig } from '@/lib/selling-config'
import { cleanInviteCode } from '@/lib/invites-shared'

const NO_STORE = { 'Cache-Control': 'no-store' }

// An invite link (components/invite-landing.tsx): is the code real, and what does the friend get?
// Answers with the inviter's first name only -- never their phone number.
export async function GET(req: Request) {
  // Counted in the database. In memory, as before, each Cloudflare copy of the app counted on its own, so guessing
  // invite codes got more tries than the 30 per 10 minutes meant here.
  const limit = await consumeDurableRateLimit(`invite:${clientIp(req.headers)}`, 30, 10 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE })
  const code = cleanInviteCode(new URL(req.url).searchParams.get('code'))
  const config = await getSellingConfig().then(c => c.invite).catch(() => null)
  if (!code || !config?.enabled) return json({ error: 'This invite is not valid.' }, { status: 404, headers: NO_STORE })
  const row = await db.inviteCode.findUnique({ where: { code }, select: { code: true, name: true } })
  if (!row) return json({ error: 'This invite is not valid.' }, { status: 404, headers: NO_STORE })
  return json({ code: row.code, percent: config.friendPercent, name: String(row.name || '').trim().split(/\s+/)[0] || '' }, { headers: NO_STORE })
}
