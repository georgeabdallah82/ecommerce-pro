import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { signTicket, verifyTicket } from '@/lib/live-chat/ticket'
import { LiveChatHub } from '@/lib/live-chat/hub'
import { dmKey } from '@/lib/team-chat/server'

// Team chat (docs/team-chat-2026-11.md): what can be checked without Cloudflare or a database.

const SECRET = 'test-secret-0123456789abcdef'

describe('team chat: who receives what', () => {
  it('a team ticket names the staff member, and is refused without one', async () => {
    const ok = await verifyTicket(SECRET, await signTicket(SECRET, { role: 'team', conversationId: null, userId: 'cmuserAAAAAAAA1' }))
    assert.equal(ok?.role, 'team')
    assert.equal(ok?.userId, 'cmuserAAAAAAAA1')
    assert.equal(await verifyTicket(SECRET, await signTicket(SECRET, { role: 'team', conversationId: null })), null)
  })

  function hubWith() {
    const sockets: Array<{ tags: string[]; sent: string[]; send(d: string): void; close(): void }> = []
    const add = (tags: string[]) => { const s = { tags, sent: [] as string[], send(d: string) { this.sent.push(d) }, close() {} }; sockets.push(s); return s }
    const state = {
      acceptWebSocket() {},
      getWebSockets: (tag?: string) => sockets.filter(s => !tag || s.tags.includes(tag)),
      storage: { get: async () => undefined as never, put: async () => {} },
    }
    return { hub: new LiveChatHub(state, {}), add }
  }
  const post = (path: string, body: unknown) => new Request(`https://live-chat${path}`, { method: 'POST', body: JSON.stringify(body) })
  const event = { type: 'team', channelId: 'ch1', message: { id: 'm1', authorId: 'a', authorName: 'Maya', text: 'Hi', at: new Date().toISOString() } }

  it('the team room reaches every staff member on Team chat, never shoppers or the live chat inbox', async () => {
    const { hub, add } = hubWith()
    const maya = add(['team', 'user:a']), rami = add(['team', 'user:b']), shopper = add(['chat:xyz']), inbox = add(['staff'])
    await hub.fetch(post('/team', { users: null, event }))
    assert.equal(maya.sent.length, 1)
    assert.equal(rami.sent.length, 1)
    assert.equal(shopper.sent.length, 0)
    assert.equal(inbox.sent.length, 0)
  })
  it('a direct chat reaches only its two people', async () => {
    const { hub, add } = hubWith()
    const maya = add(['team', 'user:a']), rami = add(['team', 'user:b']), other = add(['team', 'user:c'])
    await hub.fetch(post('/team', { users: ['a', 'b'], event }))
    assert.equal(maya.sent.length, 1)
    assert.equal(rami.sent.length, 1)
    assert.equal(other.sent.length, 0)
  })
  it('the live chat "online" switch is not sent to Team chat pages', async () => {
    const { hub, add } = hubWith()
    const team = add(['team', 'user:a']), shopper = add(['chat:xyz'])
    await hub.fetch(post('/presence', { online: true, name: 'George' }))
    assert.equal(team.sent.length, 0)
    assert.equal(shopper.sent.length, 1)
  })
})

describe('team chat: direct chats and access', () => {
  it('one direct chat per pair, whoever starts it', () => {
    assert.equal(dmKey('b', 'a'), dmKey('a', 'b'))
    assert.equal(dmKey('a', 'b'), 'dm:a:b')
  })
  it('a direct chat is open only to its two people; the team room to all staff', () => {
    const src = readFileSync('lib/team-chat/server.ts', 'utf8')
    assert.match(src, /if \(channel\.kind === 'team'\) return channel\n  return channel\.key\.split\(':'\)\.slice\(1\)\.includes\(userId\) \? channel : null/)
    assert.match(src, /where: \{ role: \{ not: 'CUSTOMER' \}, isActive: true \}/)
  })
  it('only the author or the owner can delete a message, and it is logged', () => {
    assert.match(readFileSync('lib/team-chat/server.ts', 'utf8'), /row\.authorId !== user\.id && user\.role !== 'SUPER_ADMIN'/)
    assert.match(readFileSync('app/api/admin/team-chat/route.ts', 'utf8'), /audit\(user\.id, 'teamchat\.message\.deleted'/)
  })
  it('every staff member can open it (requireStaff), and messages are kept 90 days', () => {
    assert.match(readFileSync('app/api/admin/team-chat/route.ts', 'utf8'), /const user = await requireStaff\(\)/)
    assert.match(readFileSync('app/api/internal/daily/route.ts', 'utf8'), /pruneTeamChat\(now\)/)
    assert.match(readFileSync('lib/team-chat/server.ts', 'utf8'), /RETENTION_DAYS = 90/)
  })
  it('unread counts for all chats take two queries, whatever the number of chats (Workers Free: 50 calls a request)', () => {
    const src = readFileSync('lib/team-chat/server.ts', 'utf8')
    const list = src.slice(src.indexOf('export async function channelsFor'), src.indexOf('// For the badge on Team chat'))
    assert.equal((list.match(/db\.\$queryRaw/g) || []).length, 2)
    assert.doesNotMatch(list, /channels\.map\(async/)
  })
})
