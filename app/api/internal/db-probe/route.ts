import { databaseClientStats, db } from '@/lib/prisma'

// Rehearsal diagnostics: runs one small query and returns the database error in full when it
// fails. Only answers on a preview version uploaded with REHEARSAL_ERROR_DETAILS=1
// (.github/workflows/preview-load.yml); everywhere else it does not exist.
export async function GET() {
  if (process.env.REHEARSAL_ERROR_DETAILS !== '1') return Response.json({ error: 'Not found' }, { status: 404 })
  const started = Date.now()
  try {
    await db.setting.findFirst({ select: { key: true } })
    return Response.json({ ok: true, ms: Date.now() - started, clients: databaseClientStats() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return Response.json({ ok: false, ms: Date.now() - started, error: String((e as Error)?.stack || e).slice(0, 3000), clients: databaseClientStats() }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
