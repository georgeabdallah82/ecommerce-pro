import crypto from 'node:crypto'
import { db } from '@/lib/prisma'

// Email verification for new customer accounts. The link carries a random token; only its SHA-256
// hash is stored, the link works once and for 48 hours, and a new link replaces the old one.
export const VERIFY_HOURS = 48
const DAY_MS = 24 * 60 * 60 * 1000

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

// Makes a new link for the account (the old link stops working).
export async function createVerificationToken(userId: string, now = new Date()) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + VERIFY_HOURS * 60 * 60 * 1000)
  await db.$transaction(async tx => {
    await tx.emailVerificationToken.deleteMany({ where: { userId } })
    await tx.emailVerificationToken.create({ data: { tokenHash: hash(token), expiresAt, userId } })
  })
  return token
}

// Uses the link once. Returns the account it verified, or null for a wrong, used or expired link.
export async function consumeVerificationToken(token: string, now = new Date()) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, userId: true, expiresAt: true } })
  if (!row || row.expiresAt <= now) return null
  // Only the first request to spend the link gets a count of 1.
  const spent = await db.emailVerificationToken.deleteMany({ where: { id: row.id, expiresAt: { gt: now } } })
  if (spent.count !== 1) return null
  await db.user.updateMany({ where: { id: row.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } })
  await db.emailVerificationToken.deleteMany({ where: { userId: row.userId } })
  return row.userId
}

// The address the links point at: the store's configured address, or this request's host.
export function siteBase(host: string | null | undefined, configured?: string | null) {
  const fromEnv = (configured || '').replace(/\/$/, '')
  if (fromEnv) return fromEnv
  return host ? `https://${host}` : ''
}

export const MS_PER_DAY = DAY_MS
