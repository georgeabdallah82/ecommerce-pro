import { getGithubStatus } from '@/lib/website-status'
import { databaseHoursAdvice, type HoursAdvice } from '@/lib/database-hours'

// The latest hours check, read from GitHub's run log through the Website status loader. Never throws:
// when GitHub is not connected, slow or unreadable the answer is just "unknown" (null).
export async function loadDatabaseHoursAdvice(timeoutMs = 6000): Promise<HoursAdvice | null> {
  try {
    const status = await Promise.race([
      getGithubStatus(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!status || status.state !== 'ready') return null
    return databaseHoursAdvice(status.data.neonUsage)
  } catch {
    return null
  }
}
