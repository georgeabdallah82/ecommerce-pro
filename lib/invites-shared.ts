// "Invite a friend": the plain rules, shared by the store pages, checkout, the admin and tests
// (the database side is lib/invites.ts).
//
// Every customer gets their own code, tied to their phone number (most customers order without
// an account). A friend who orders with it gets a percentage off their first order; once that
// order is delivered, the store sends the inviter a one-use thank-you code on WhatsApp
// (Admin > Customers > Invites).

export const INVITE_KEYS = {
  enabled: 'invite.enabled',
  friendPercent: 'invite.friendPercent',
  reward: 'invite.reward',
  rewardDays: 'invite.rewardDays',
} as const

type Settings = Record<string, string | undefined> | Map<string, string>
const read = (settings: Settings, key: string) => String((settings instanceof Map ? settings.get(key) : settings[key]) ?? '').trim()

export type InviteConfig = { enabled: boolean; friendPercent: number; reward: number; rewardDays: number }

// Friend's discount 1-50 % (default 10); the inviter's thank-you amount in cents (default 5.00 of
// the store currency); the thank-you code is valid for 7-365 days (default 60).
export function inviteConfig(settings: Settings): InviteConfig {
  const pct = Number(read(settings, INVITE_KEYS.friendPercent) || 10)
  const reward = Number(read(settings, INVITE_KEYS.reward) || 5)
  const days = Number(read(settings, INVITE_KEYS.rewardDays) || 60)
  const friendPercent = Number.isFinite(pct) ? Math.min(50, Math.max(1, Math.round(pct))) : 10
  const rewardCents = Number.isFinite(reward) && reward > 0 ? Math.round(reward * 100) : 0
  return {
    enabled: read(settings, INVITE_KEYS.enabled) === 'true',
    friendPercent,
    reward: rewardCents,
    rewardDays: Number.isFinite(days) ? Math.min(365, Math.max(7, Math.round(days))) : 60,
  }
}

// Letters and digits that can't be mistaken for each other when read out or typed (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomPart(length: number, random: () => number = Math.random) {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length]
  return out
}

// "MAYA4K7": the customer's first name (Latin letters only, up to 6) and 3 random characters, so
// friends recognise whose code it is. Names in Arabic letters get "FRIEND".
export function makeInviteCode(name: string | null | undefined, random: () => number = Math.random) {
  const first = String(name || '').trim().split(/\s+/)[0] || ''
  const letters = first.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6)
  return `${letters.length >= 2 ? letters : 'FRIEND'}${randomPart(3, random)}`
}

// What a typed or linked code may look like before it is looked up.
export function cleanInviteCode(raw: unknown) {
  const code = String(raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{4,20}$/.test(code) ? code : ''
}

export function inviteLink(siteUrl: string, code: string) {
  return `${siteUrl.replace(/\/$/, '')}/?invite=${encodeURIComponent(code)}`
}

type Translate = (text: string, vars?: Record<string, string | number>) => string

// What the customer sends their friends (thank-you page, "Share on WhatsApp"), in the page's language.
export function inviteShareMessage(input: { storeName: string; code: string; percent: number; link: string }, t: Translate) {
  return [
    t('I shop at {store}. Use my code {code} for {percent}% off your first order:', { store: input.storeName || t('this store'), code: input.code, percent: input.percent }),
    input.link,
  ].join('\n')
}

// What the store sends the inviter with the thank-you code (Admin > Customers > Invites). Staff
// send it as written; it is in English like the other admin messages.
export function inviteRewardMessage(input: { storeName: string; inviterName: string; friendName: string; amount: string; code: string; expires: string; siteUrl: string }) {
  const hi = input.inviterName ? `Hi ${input.inviterName}!` : 'Hi!'
  const friend = input.friendName ? `Your friend ${input.friendName}` : 'Your friend'
  return [
    `${hi} ${friend} received their order from ${input.storeName || 'our store'}. Thank you for inviting them!`,
    '',
    `Here is ${input.amount} off your next order. Use code ${input.code} at checkout${input.expires ? ` (valid until ${input.expires})` : ''}.`,
    input.siteUrl,
  ].filter((line, i, all) => line || all[i - 1] !== '').join('\n')
}
