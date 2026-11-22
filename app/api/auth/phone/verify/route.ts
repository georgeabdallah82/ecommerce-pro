import { json } from '@/lib/utils'
import { setSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/request-ip'
import { safeNextPath } from '@/lib/links'
import { verifyPhoneSignIn } from '@/lib/phone-sign-in'

// "Sign in with WhatsApp", step 2: the code from WhatsApp signs the customer in (lib/phone-sign-in.ts). Customers only:
// a staff account is never signed in by a phone code.
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as { phone?: unknown; code?: unknown; next?: unknown }
  const result = await verifyPhoneSignIn(body.phone, body.code, clientIp(req.headers))
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!result.ok) return json({ error: result.error }, { status: result.status, headers })
  await setSession(result.userId)
  await audit(result.userId, result.created ? 'customer.phone_signup' : 'customer.phone_login', 'User', result.userId, { ordersLinked: result.ordersLinked }).catch(() => undefined)
  return json({ ok: true, next: safeNextPath(body.next) }, { headers })
}
