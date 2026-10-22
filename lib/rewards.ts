import { randomInt } from 'node:crypto'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { getBlockedPhones } from '@/lib/blocked-phones'
import { internationalPhone } from '@/lib/phone'
import { randomPart } from '@/lib/invites-shared'
import { REWARDS_SETTING, REWARD_CODE_PREFIX, normalizeRewardsConfig, rewardCustomers, type RewardsConfig } from '@/lib/rewards-shared'

// "Rewards by phone number", the database side (the rules are in lib/rewards-shared.ts).

const secureRandom = () => randomInt(0, 1_000_000) / 1_000_000

export async function getRewardsConfig(): Promise<RewardsConfig> {
  const row = await db.setting.findUnique({ where: { key: REWARDS_SETTING }, select: { value: true } })
  return normalizeRewardsConfig(row?.value)
}

export async function saveRewardsConfig(config: RewardsConfig) {
  await db.setting.upsert({ where: { key: REWARDS_SETTING }, create: { key: REWARDS_SETTING, value: JSON.stringify(config) }, update: { value: JSON.stringify(config) } })
}

// Customers with a reward still to make, from the delivered orders and the codes already made.
export async function loadRewardCustomers(config: RewardsConfig) {
  const store = await getStoreIdentity()
  const [orders, made, blocked] = await Promise.all([
    db.order.findMany({ where: { status: 'DELIVERED' }, orderBy: { createdAt: 'desc' }, take: 20000, select: { status: true, createdAt: true, phone: true, shippingAddressJson: true } }),
    db.phoneReward.groupBy({ by: ['phone'], _count: { _all: true } }),
    getBlockedPhones().catch(() => []),
  ])
  const given = new Map(made.map(row => [row.phone, row._count._all]))
  const blockedSet = new Set(blocked.map(b => internationalPhone(b.phone, store.country)).filter(Boolean))
  return rewardCustomers(orders, given, config, { storeCountry: store.country, blocked: blockedSet })
}

export type MadeReward = { code: string; phone: string; name: string; delivered: number; percent: number; days: number; expiresAt: Date }

// Makes the next reward for a phone number: a one-use percentage discount in Discounts. The number
// must really have a reward waiting (worked out again here from the orders, never trusted from the
// page), and the same reward can never be made twice, even if staff tap twice.
export async function createPhoneReward(rawPhone: string): Promise<MadeReward> {
  const config = await getRewardsConfig()
  if (!config.enabled) throw new Error('Rewards are switched off. Switch them on first.')
  const store = await getStoreIdentity()
  const phone = internationalPhone(rawPhone, store.country)
  if (!phone) throw new Error('That phone number is not valid.')
  const customer = (await loadRewardCustomers(config)).find(c => c.phone === phone)
  if (!customer) throw new Error('This customer has no reward waiting.')

  const expiresAt = new Date(Date.now() + config.days * 24 * 60 * 60 * 1000)
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${REWARD_CODE_PREFIX}${randomPart(5, secureRandom)}`
    if (await db.coupon.findUnique({ where: { code }, select: { id: true } })) continue
    // The reward row first: its phone and milestone allow one per reward.
    try {
      await db.phoneReward.create({ data: { phone, milestone: customer.nextMilestone, code, name: customer.name.slice(0, 80) || null } })
    } catch (error) {
      const unique = error instanceof Error && /unique/i.test(error.message)
      if (unique && await db.phoneReward.findUnique({ where: { phone_milestone: { phone, milestone: customer.nextMilestone } } })) throw new Error('This reward was already made.')
      if (unique) continue
      throw error
    }
    try {
      await db.coupon.create({ data: { code, type: 'PERCENTAGE', value: config.percent, maxUses: 1, expiresAt, isActive: true } })
    } catch (error) {
      await db.phoneReward.delete({ where: { code } }).catch(() => {})
      throw error
    }
    return { code, phone, name: customer.name, delivered: customer.delivered, percent: config.percent, days: config.days, expiresAt }
  }
  throw new Error('Could not make a code, please try again.')
}
