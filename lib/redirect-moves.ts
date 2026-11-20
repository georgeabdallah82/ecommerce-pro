import { db } from '@/lib/prisma'
import { redirectProblem } from '@/lib/redirects'
import { clearEdgeCopies } from '@/lib/edge-config'
import { runInBackground } from '@/lib/background'

// A published page or blog post moved to a new address (its handle changed) and the editor ticked "send visitors
// from the old address": the old address now leads to the new one (Admin > Online store > Pages and Blog).
// - A redirect leaving from the new address would hide the page there (a page renamed back), so it goes.
// - One already leaving from the old address now points at the new one.
// - Anything lib/redirects.ts refuses (a circle) adds nothing: false.
export async function redirectMovedPage(from: string, to: string): Promise<boolean> {
  await db.redirect.deleteMany({ where: { fromPath: to } })
  // The proxy's copy holds every redirect (lib/edge-config.ts): cleared now, and again once the new one is in.
  await clearEdgeCopies('config', runInBackground)
  const others = await db.redirect.findMany({ select: { id: true, fromPath: true, toPath: true } })
  const existing = others.find(rule => rule.fromPath === from)
  if (redirectProblem(from, to, others, existing?.id)) return false
  if (existing) await db.redirect.update({ where: { id: existing.id }, data: { toPath: to } })
  else await db.redirect.create({ data: { fromPath: from, toPath: to } })
  await clearEdgeCopies('config', runInBackground)
  return true
}
