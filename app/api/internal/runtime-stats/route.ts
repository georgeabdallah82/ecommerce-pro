import { databaseClientStats } from '@/lib/prisma'

// The database connections this Worker isolate holds (lib/prisma.ts): one shared Prisma client and
// the per-request connection pools, which must all be closed again ("open" back to zero) once
// requests finish; the rehearsal e2e checks that after a burst of page loads. Same bearer secret as
// the cron jobs.
export async function GET(req: Request) {
  const configured = process.env.CRON_SECRET
  if (!configured || req.headers.get('authorization') !== `Bearer ${configured}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json({ database: databaseClientStats() }, { headers: { 'Cache-Control': 'no-store' } })
}
