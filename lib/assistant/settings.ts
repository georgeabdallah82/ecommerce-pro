import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'
import { getStoreIdentity } from '@/lib/store-identity'
import { parseAssistantConfig, withStoreName, type AssistantConfig } from './config'

// The assistant's settings from Admin › AI assistant (Setting rows "assistant.*"), with the
// store's name filled into the welcome texts. Shared for 30 seconds like the storefront's other data.
export async function loadAssistantConfig(): Promise<AssistantConfig & { storeName: string }> {
  return storefrontCached('assistant-config', async () => {
    const [rows, identity] = await Promise.all([
      db.setting.findMany({ where: { key: { startsWith: 'assistant.' } }, select: { key: true, value: true } }),
      getStoreIdentity().catch(() => ({ name: 'our store', country: 'Lebanon' })),
    ])
    const config = parseAssistantConfig(new Map(rows.map(r => [r.key, r.value])))
    return { ...config, welcome: withStoreName(config.welcome, identity.name), welcomeAr: withStoreName(config.welcomeAr, identity.name), storeName: identity.name }
  })
}

// The same, read fresh (for the admin page and for the switch-off check before a Claude call).
export async function loadAssistantConfigFresh(): Promise<AssistantConfig> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: 'assistant.' } }, select: { key: true, value: true } })
  return parseAssistantConfig(new Map(rows.map(r => [r.key, r.value])))
}

export const ASSISTANT_RETENTION_DAYS = 90

// Chats older than 90 days are deleted with their messages (run by the daily job).
export async function pruneAssistantData(now = new Date()) {
  const { count } = await db.assistantConversation.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - ASSISTANT_RETENTION_DAYS * 86_400_000) } } })
  return count
}
