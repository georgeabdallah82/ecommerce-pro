import { databaseClientStats } from '@/lib/prisma'

// How many database clients this Worker isolate holds (lib/prisma.ts). Each carries about 1 MB of
// WebAssembly memory, so "open" must come back down to the idle pool once requests finish; the
// rehearsal e2e checks that after a burst of page loads. Same bearer secret as the cron jobs.
export async function GET(req: Request) {
  const configured = process.env.CRON_SECRET
  if (!configured || req.headers.get('authorization') !== `Bearer ${configured}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json({ database: databaseClientStats() }, { headers: { 'Cache-Control': 'no-store' } })
}
