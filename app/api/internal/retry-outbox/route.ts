import { isInternalJobRequest } from '@/lib/internal-job'
import { retryOutbox } from '@/lib/outbox'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'no-store' }

// Run at the top of each hour by the Worker's cron (worker.ts), or by hand with the CRON_SECRET bearer: failed
// emails and webhook deliveries whose next try is due (lib/outbox.ts).
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  try {
    return json(await retryOutbox(), { headers: NO_STORE })
  } catch (error) {
    console.error('[retry-outbox] failed', error)
    return json({ error: 'The retry job failed' }, { status: 500, headers: NO_STORE })
  }
}
