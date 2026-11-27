import { db } from '@/lib/prisma'
import { runInBackground } from '@/lib/background'
import { sendTeamChatPush } from '@/lib/push'
import { publishTeam } from '@/lib/live-chat/relay'

// Team chat (Admin › Team chat, docs/team-chat-2026-11.md): the staff's own messages. Everyone with a
// staff account (not customers; drivers have no account) is in the team room and can start a direct
// chat with anyone else on the staff. Messages arrive at once through the live chat relay
// (lib/live-chat/hub.ts); nothing polls the database. Kept 90 days (pruneTeamChat).

export const TEAM_KEY = 'team'
export const MAX_MESSAGE = 2000
export const RETENTION_DAYS = 90

export type StaffMember = { id: string; name: string }
export type TeamMessage = { id: string; authorId: string; authorName: string; text: string; at: string; deleted?: boolean }
export type ChannelSummary = { id: string; kind: 'team' | 'direct'; title: string; otherUserId: string | null; unread: number; muted: boolean; lastAt: string | null; last: string | null }

const displayName = (u: { name: string | null; email: string }) => (u.name || u.email.split('@')[0]).trim().slice(0, 60)
export const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join(':')}`

// Everyone on the staff who can sign in.
export async function staffMembers(): Promise<StaffMember[]> {
  const users = await db.user.findMany({ where: { role: { not: 'CUSTOMER' }, isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 200 })
  return users.map(u => ({ id: u.id, name: displayName(u) }))
}

async function teamChannel() {
  return db.staffChannel.upsert({ where: { key: TEAM_KEY }, create: { key: TEAM_KEY, kind: 'team' }, update: {}, select: { id: true, key: true, kind: true } })
}

// A direct chat with another active staff member (made the first time).
export async function directChannel(userId: string, otherId: string) {
  if (userId === otherId) return null
  const other = await db.user.findFirst({ where: { id: otherId, role: { not: 'CUSTOMER' }, isActive: true }, select: { id: true } })
  if (!other) return null
  const key = dmKey(userId, otherId)
  const channel = await db.staffChannel.upsert({ where: { key }, create: { key, kind: 'direct' }, update: {}, select: { id: true, key: true, kind: true } })
  await db.staffChannelMember.createMany({ data: [{ channelId: channel.id, userId, lastReadAt: new Date(0) }, { channelId: channel.id, userId: otherId, lastReadAt: new Date(0) }], skipDuplicates: true })
  return channel
}

// The channel if this person may use it: the team room, or a direct chat they are one of the two in.
export async function channelFor(userId: string, channelId: string) {
  const channel = await db.staffChannel.findUnique({ where: { id: channelId }, select: { id: true, key: true, kind: true } })
  if (!channel) return null
  if (channel.kind === 'team') return channel
  return channel.key.split(':').slice(1).includes(userId) ? channel : null
}

const otherOf = (key: string, userId: string) => key.split(':').slice(1).find(id => id !== userId) || null
const membersOf = (key: string) => key.split(':').slice(1)

// The team room first, then direct chats by latest message, each with this person's unread count.
export async function channelsFor(userId: string): Promise<ChannelSummary[]> {
  const team = await teamChannel()
  const [direct, memberships, staff] = await Promise.all([
    db.staffChannel.findMany({ where: { kind: 'direct', key: { contains: userId } }, select: { id: true, key: true, lastMessageAt: true }, orderBy: { lastMessageAt: 'desc' }, take: 100 }),
    db.staffChannelMember.findMany({ where: { userId }, select: { channelId: true, lastReadAt: true, muted: true } }),
    staffMembers(),
  ])
  const names = new Map(staff.map(s => [s.id, s.name]))
  const mine = new Map(memberships.map(m => [m.channelId, m]))
  const channels = [{ id: team.id, key: team.key, kind: 'team' as const }, ...direct.filter(c => membersOf(c.key).includes(userId)).map(c => ({ id: c.id, key: c.key, kind: 'direct' as const }))]
  const ids = channels.map(c => c.id)
  // Two queries for every channel together (Workers Free allows 50 outside calls per request): unread
  // counts after each person's read mark (the team room counts from now until first opened), and the
  // latest message in each channel.
  const [unreadRows, lastRows] = await Promise.all([
    db.$queryRaw<Array<{ channelId: string; unread: bigint }>>`
      SELECT m."channelId", COUNT(*) AS unread
      FROM "StaffMessage" m
      LEFT JOIN "StaffChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${userId}
      WHERE m."channelId" = ANY(${ids}) AND m."authorId" <> ${userId} AND m."deletedAt" IS NULL
        AND m."createdAt" > COALESCE(cm."lastReadAt", NOW())
      GROUP BY m."channelId"`,
    db.$queryRaw<Array<{ channelId: string; text: string; authorName: string; createdAt: Date; deletedAt: Date | null }>>`
      SELECT DISTINCT ON ("channelId") "channelId", "text", "authorName", "createdAt", "deletedAt"
      FROM "StaffMessage" WHERE "channelId" = ANY(${ids})
      ORDER BY "channelId", "createdAt" DESC`,
  ])
  const unread = new Map(unreadRows.map(r => [r.channelId, Number(r.unread)]))
  const lastBy = new Map(lastRows.map(r => [r.channelId, r]))
  return channels.map(c => {
    const read = mine.get(c.id)
    const last = lastBy.get(c.id)
    const other = c.kind === 'direct' ? otherOf(c.key, userId) : null
    return {
      id: c.id,
      kind: c.kind,
      title: c.kind === 'team' ? 'Team room' : (other && names.get(other)) || 'Former staff member',
      otherUserId: other,
      unread: unread.get(c.id) || 0,
      muted: !!read?.muted,
      lastAt: last ? new Date(last.createdAt).toISOString() : null,
      last: last ? (last.deletedAt ? 'Message deleted' : `${last.authorName}: ${last.text}`.slice(0, 120)) : null,
    }
  })
}

// For the badge on Team chat in the admin menu.
export async function unreadTotal(userId: string) {
  const rows = await db.$queryRaw<Array<{ unread: bigint }>>`
    SELECT COUNT(*) AS unread
    FROM "StaffMessage" m
    JOIN "StaffChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${userId}
    WHERE m."authorId" <> ${userId} AND m."deletedAt" IS NULL AND m."createdAt" > cm."lastReadAt"`
  return Number(rows[0]?.unread || 0)
}

const asMessage = (m: { id: string; authorId: string; authorName: string; text: string; createdAt: Date; deletedAt: Date | null }): TeamMessage => ({
  id: m.id, authorId: m.authorId, authorName: m.authorName, text: m.deletedAt ? '' : m.text, at: m.createdAt.toISOString(), ...(m.deletedAt ? { deleted: true } : {}),
})

// The latest messages (or those before `before`), oldest first; opening a channel marks it read.
export async function messagesIn(channelId: string, userId: string, before: Date | null, limit = 60) {
  const rows = await db.staffMessage.findMany({ where: { channelId, ...(before ? { createdAt: { lt: before } } : {}) }, select: { id: true, authorId: true, authorName: true, text: true, createdAt: true, deletedAt: true }, orderBy: { createdAt: 'desc' }, take: limit })
  if (!before) await markRead(channelId, userId)
  return rows.reverse().map(asMessage)
}

export async function markRead(channelId: string, userId: string) {
  await db.staffChannelMember.upsert({ where: { channelId_userId: { channelId, userId } }, create: { channelId, userId, lastReadAt: new Date() }, update: { lastReadAt: new Date() } })
}

export async function setMuted(channelId: string, userId: string, muted: boolean) {
  await db.staffChannelMember.upsert({ where: { channelId_userId: { channelId, userId } }, create: { channelId, userId, muted }, update: { muted } })
}

// A new message: saved, sent at once to everyone who can see the channel, and a phone notification to
// those who haven't muted it (never to the author).
export async function sendMessage(channel: { id: string; key: string; kind: string }, author: { id: string; name: string | null; email: string }, text: string) {
  const now = new Date()
  const [row] = await db.$transaction([
    db.staffMessage.create({ data: { channelId: channel.id, authorId: author.id, authorName: displayName(author), text: text.slice(0, MAX_MESSAGE), createdAt: now }, select: { id: true, authorId: true, authorName: true, text: true, createdAt: true, deletedAt: true } }),
    db.staffChannel.update({ where: { id: channel.id }, data: { lastMessageAt: now } }),
    db.staffChannelMember.upsert({ where: { channelId_userId: { channelId: channel.id, userId: author.id } }, create: { channelId: channel.id, userId: author.id, lastReadAt: now }, update: { lastReadAt: now } }),
  ])
  const message = asMessage(row)
  const audience = channel.kind === 'team' ? null : membersOf(channel.key)
  await publishTeam(audience, { type: 'team', channelId: channel.id, message })
  runInBackground(notify(channel, author.id, message).catch(error => console.error('[team-chat] alert failed', error)))
  return message
}

async function notify(channel: { id: string; key: string; kind: string }, authorId: string, message: TeamMessage) {
  const recipients = channel.kind === 'team' ? (await staffMembers()).map(s => s.id) : membersOf(channel.key)
  const muted = new Set((await db.staffChannelMember.findMany({ where: { channelId: channel.id, muted: true }, select: { userId: true } })).map(m => m.userId))
  const to = recipients.filter(id => id !== authorId && !muted.has(id))
  if (!to.length) return
  const title = channel.kind === 'team' ? `${message.authorName} in Team room` : message.authorName
  await sendTeamChatPush(to, { title, body: message.text.length > 120 ? `${message.text.slice(0, 117)}...` : message.text, channelId: channel.id })
}

// Authors can delete their own messages; the owner (super admin) can delete any.
export async function deleteMessage(messageId: string, user: { id: string; role: string }) {
  const row = await db.staffMessage.findUnique({ where: { id: messageId }, select: { id: true, authorId: true, channelId: true, deletedAt: true, channel: { select: { key: true, kind: true } } } })
  if (!row) return { ok: false as const, status: 404, error: 'That message was already deleted.' }
  if (row.authorId !== user.id && user.role !== 'SUPER_ADMIN') return { ok: false as const, status: 403, error: 'You can only delete your own messages.' }
  if (!row.deletedAt) {
    const updated = await db.staffMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), text: '' }, select: { id: true, authorId: true, authorName: true, text: true, createdAt: true, deletedAt: true } })
    await publishTeam(row.channel.kind === 'team' ? null : membersOf(row.channel.key), { type: 'team', channelId: row.channelId, message: asMessage(updated) })
  }
  return { ok: true as const, channelId: row.channelId }
}

// Run by the daily job: messages older than 90 days are deleted.
export async function pruneTeamChat(now = new Date()) {
  const { count } = await db.staffMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } })
  return count
}
