// A short-lived pass for opening the live chat connection (worker.ts /api/live-chat/socket), signed
// with AUTH_SECRET. The store's own routes hand one out only after their usual checks: a shopper for
// their own chat (the chat cookie), staff with the AI assistant permission. No database or Next.js
// code, so worker.ts can check it before anything else runs.

// staff: Admin › Live chat (shopper chats). shopper: their own chat. team: one staff member in Team chat
// (lib/team-chat), who receives only the team room and their own direct chats.
export type LiveRole = 'staff' | 'shopper' | 'team'
export type LiveTicket = { role: LiveRole; conversationId: string | null; userId?: string | null; expires: number }

export const TICKET_TTL_MS = 10 * 60 * 1000

const encoder = new TextEncoder()
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

async function key(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(`live-chat:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signTicket(secret: string, ticket: Omit<LiveTicket, 'expires'>, now = Date.now()) {
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const body = b64url(encoder.encode(JSON.stringify({ r: ticket.role, c: ticket.conversationId, ...(ticket.userId ? { u: ticket.userId } : {}), e: now + TICKET_TTL_MS })))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body)))
  return `${body}.${b64url(sig)}`
}

export async function verifyTicket(secret: string, token: string | null | undefined, now = Date.now()): Promise<LiveTicket | null> {
  if (!secret || !token || token.length > 600) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), encoder.encode(body))
    if (!ok) return null
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { r?: unknown; c?: unknown; u?: unknown; e?: unknown }
    if ((data.r !== 'staff' && data.r !== 'shopper' && data.r !== 'team') || typeof data.e !== 'number' || data.e < now) return null
    const conversationId = typeof data.c === 'string' && /^[a-z0-9]{10,40}$/i.test(data.c) ? data.c : null
    if (data.r === 'shopper' && !conversationId) return null
    const userId = typeof data.u === 'string' && /^[a-z0-9]{10,40}$/i.test(data.u) ? data.u : null
    if (data.r === 'team' && !userId) return null
    return { role: data.r, conversationId, ...(userId ? { userId } : {}), expires: data.e }
  } catch {
    return null
  }
}
