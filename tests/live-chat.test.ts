import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { TICKET_TTL_MS, signTicket, verifyTicket } from '@/lib/live-chat/ticket'
import { LiveChatHub } from '@/lib/live-chat/hub'
import { redactCards } from '@/lib/assistant/redact'

// Live chat (docs/live-chat-2026-11.md): what can be checked without Cloudflare or a database.

const SECRET = 'test-secret-0123456789abcdef'

describe('live chat: connection tickets', () => {
  it('a shopper ticket opens only its own chat, a staff ticket the inbox', async () => {
    const shopper = await signTicket(SECRET, { role: 'shopper', conversationId: 'cmwy5abcdef0123' })
    assert.deepEqual({ ...(await verifyTicket(SECRET, shopper))!, expires: 0 }, { role: 'shopper', conversationId: 'cmwy5abcdef0123', expires: 0 })
    const staff = await signTicket(SECRET, { role: 'staff', conversationId: null })
    assert.equal((await verifyTicket(SECRET, staff))?.role, 'staff')
  })
  it('refuses changed, expired, foreign or malformed tickets', async () => {
    const ticket = await signTicket(SECRET, { role: 'shopper', conversationId: 'cmwy5abcdef0123' })
    const [body, sig] = ticket.split('.')
    // Swapping the role in the signed part breaks the signature.
    const forged = Buffer.from(JSON.stringify({ r: 'staff', c: null, e: Date.now() + 60_000 })).toString('base64url')
    assert.equal(await verifyTicket(SECRET, `${forged}.${sig}`), null)
    assert.equal(await verifyTicket(SECRET, `${body}.${sig.slice(0, -2)}xx`), null)
    assert.equal(await verifyTicket('another-secret', ticket), null)
    assert.equal(await verifyTicket(SECRET, ticket, Date.now() + TICKET_TTL_MS + 1000), null)
    assert.equal(await verifyTicket(SECRET, ''), null)
    assert.equal(await verifyTicket(SECRET, 'x'.repeat(700)), null)
    assert.equal(await verifyTicket('', ticket), null)
    // A shopper ticket always names a chat.
    const noChat = await signTicket(SECRET, { role: 'shopper', conversationId: null })
    assert.equal(await verifyTicket(SECRET, noChat), null)
  })
  it('lasts ten minutes (only to open the connection)', () => assert.equal(TICKET_TTL_MS, 600_000))
})

describe('live chat: the relay', () => {
  function fakeState() {
    const store = new Map<string, unknown>()
    const sockets: Array<{ tags: string[]; sent: string[]; send(d: string): void; close(): void }> = []
    const add = (tags: string[]) => { const s = { tags, sent: [] as string[], send(d: string) { this.sent.push(d) }, close() {} }; sockets.push(s); return s }
    const state = {
      acceptWebSocket() {},
      getWebSockets: (tag?: string) => sockets.filter(s => !tag || s.tags.includes(tag)),
      storage: { get: async (k: string) => store.get(k) as never, put: async (k: string, v: unknown) => { store.set(k, v) } },
    }
    return { state, add }
  }
  const post = (path: string, body: unknown) => new Request(`https://live-chat${path}`, { method: 'POST', body: JSON.stringify(body) })

  it('keeps the online switch and tells every open chat', async () => {
    const { state, add } = fakeState()
    const hub = new LiveChatHub(state, {})
    const shopper = add(['chat:abc']), staff = add(['staff'])
    assert.equal((await (await hub.fetch(new Request('https://live-chat/presence'))).json() as { online: boolean }).online, false)
    const res = await (await hub.fetch(post('/presence', { online: true, name: 'George' }))).json() as { online: boolean; name: string; staffConnected: number }
    assert.equal(res.online, true)
    assert.equal(res.name, 'George')
    assert.equal(res.staffConnected, 1)
    for (const s of [shopper, staff]) assert.deepEqual(JSON.parse(s.sent.at(-1)!), { type: 'presence', online: true, name: 'George' })
  })
  it('passes a reply only to that chat and to staff, never to other shoppers', async () => {
    const { state, add } = fakeState()
    const hub = new LiveChatHub(state, {})
    const mine = add(['chat:abc']), other = add(['chat:xyz']), staff = add(['staff'])
    const event = { type: 'message', conversationId: 'abc', message: { id: 'm1', role: 'agent', text: 'Hello!', at: new Date().toISOString(), author: 'George' } }
    assert.equal((await hub.fetch(post('/publish', { to: 'both', event }))).status, 200)
    assert.equal(mine.sent.length, 1)
    assert.equal(staff.sent.length, 1)
    assert.equal(other.sent.length, 0)
    await hub.fetch(post('/publish', { to: 'staff', event: { type: 'waiting', conversationId: 'abc', waiting: true } }))
    assert.equal(mine.sent.length, 1)
    assert.equal(staff.sent.length, 2)
    // Only messages and waits can be published; presence goes through /presence.
    assert.equal((await hub.fetch(post('/publish', { to: 'both', event: { type: 'presence', online: true, name: 'x' } }))).status, 400)
  })
  it('a socket without a role or chat is refused', async () => {
    const { state } = fakeState()
    const hub = new LiveChatHub(state, {})
    const res = await hub.fetch(new Request('https://live-chat/socket', { headers: { Upgrade: 'websocket', 'x-live-role': 'shopper' } }))
    assert.equal(res.status, 403)
  })
})

describe('live chat: the store side', () => {
  const route = readFileSync('app/api/assistant/route.ts', 'utf8')
  const worker = readFileSync('worker.ts', 'utf8')
  it('a message goes to a person only while the store is online, and the AI steps in after 3 minutes', () => {
    assert.match(route, /\(presence = await getPresence\(\)\)\.online/)
    assert.match(route, /action === 'ai_fallback'/)
    assert.match(readFileSync('lib/live-chat/server.ts', 'utf8'), /AI_FALLBACK_MS = 3 \* 60 \* 1000/)
  })
  it('the socket needs a signed ticket and this site as its origin', () => {
    assert.match(worker, /verifyTicket\(String\(env\?\.AUTH_SECRET \|\| ''\), url\.searchParams\.get\('ticket'\)\)/)
    assert.match(worker, /new URL\(origin\)\.host !== url\.host/)
    assert.match(worker, /export \{ LiveChatHub \}/)
  })
  it('the relay is set up as a free-plan (SQLite) Durable Object', () => {
    const wrangler = readFileSync('wrangler.jsonc', 'utf8')
    assert.match(wrangler, /"name": "LIVE_CHAT", "class_name": "LiveChatHub"/)
    assert.match(wrangler, /"new_sqlite_classes": \["LiveChatHub"\]/)
  })
  it('live messages keep contact details the shopper gives on purpose, but never card numbers', () => {
    assert.equal(redactCards('call me 70 123 456 or a@b.com'), 'call me 70 123 456 or a@b.com')
    assert.equal(redactCards('card 4242 4242 4242 4242'), 'card [card]')
  })
})

describe('deleting chats', () => {
  it('only the owner and admins can delete (assistant.manage), and it is logged', () => {
    const route = readFileSync('app/api/admin/assistant/conversations/route.ts', 'utf8')
    assert.match(route, /requirePermission\('assistant\.manage'\)/)
    assert.match(route, /audit\(actor\.id, 'assistant\.chat\.deleted'/)
  })
  it('the button shows only for them, on the chat page and in the live inbox', () => {
    assert.match(readFileSync('app/admin/online-store/assistant/[id]/page.tsx', 'utf8'), /canDelete = hasPermission\(user, 'assistant\.manage'\)/)
    assert.match(readFileSync('app/admin/online-store/assistant/live/page.tsx', 'utf8'), /canDelete=\{hasPermission\(user, 'assistant\.manage'\)\}/)
  })
})
