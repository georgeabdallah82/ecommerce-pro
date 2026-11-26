import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { SETTING_KEYS, cleanSuggestions, isAssistantModel, type AssistantConfig } from '@/lib/assistant/config'
import { loadAssistantConfigFresh } from '@/lib/assistant/settings'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'You do not have permission to change the AI assistant.' }, { status: 403, headers: NO_STORE })
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  console.error('[admin/assistant] failure', error)
  return json({ error: 'Unable to save the AI assistant settings' }, { status: 500, headers: NO_STORE })
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)

// Admin › AI assistant › Settings: on/off, model, daily budget, opening texts, buttons, support note.
// The storefront picks the change up within 30 seconds (lib/storefront-cache.ts).
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('assistant.manage')
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    const budget = Number(body.dailyBudgetUsd)
    if (!Number.isFinite(budget) || budget < 0 || budget > 100) return json({ error: 'The daily budget must be between $0 and $100.' }, { status: 400, headers: NO_STORE })
    if (!isAssistantModel(body.model)) return json({ error: 'Choose one of the listed models.' }, { status: 400, headers: NO_STORE })
    const next: AssistantConfig = {
      enabled: body.enabled === true,
      model: body.model,
      dailyBudgetUsd: Math.round(budget * 100) / 100,
      welcome: text(body.welcome, 400),
      welcomeAr: text(body.welcomeAr, 400),
      suggestions: cleanSuggestions(body.suggestions),
      supportNote: text(body.supportNote, 300),
      supportNoteAr: text(body.supportNoteAr, 300),
    }
    const before = await loadAssistantConfigFresh()
    const values: Record<keyof AssistantConfig, string> = {
      enabled: String(next.enabled),
      model: next.model,
      dailyBudgetUsd: String(next.dailyBudgetUsd),
      welcome: next.welcome,
      welcomeAr: next.welcomeAr,
      suggestions: JSON.stringify(next.suggestions),
      supportNote: next.supportNote,
      supportNoteAr: next.supportNoteAr,
    }
    await db.$transaction((Object.keys(values) as Array<keyof AssistantConfig>).map(key => db.setting.upsert({
      where: { key: SETTING_KEYS[key] },
      create: { key: SETTING_KEYS[key], value: values[key] },
      update: { value: values[key] },
    })))
    const changed = (Object.keys(values) as Array<keyof AssistantConfig>).filter(key => JSON.stringify(before[key]) !== JSON.stringify(next[key]))
    if (changed.length) await audit(actor.id, 'assistant.settings', 'Setting', 'assistant', { changed, enabled: next.enabled, model: next.model, dailyBudgetUsd: next.dailyBudgetUsd })
    return json({ ok: true, config: await loadAssistantConfigFresh() }, { headers: NO_STORE })
  } catch (error) { return failure(error) }
}
