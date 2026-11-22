import { json } from '@/lib/utils'
import { clientIp } from '@/lib/request-ip'
import { shopperLang } from '@/lib/message-lang'
import { startPhoneSignIn } from '@/lib/phone-sign-in'

// "Sign in with WhatsApp", step 1: sends a 6-digit code to the number typed (lib/phone-sign-in.ts). The answer is the
// same whether or not the number has an account: an account is made when the code is entered.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {}
  const result = await startPhoneSignIn((body as { phone?: unknown }).phone, clientIp(req.headers), await shopperLang())
  if (!result.ok) return json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } })
  return json({ ok: true, phone: `+${result.phone}` }, { headers: { 'Cache-Control': 'private, no-store' } })
}
