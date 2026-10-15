import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'
import { normalizePlatform, parseSpendDate, readSpendCsv } from '@/lib/profit'

const MAX_AMOUNT = 100_000_00

// Ad spend for Reports > Profit, owner only. One amount per day and platform: saving the same
// day again (typed or imported) replaces it, so a file imported twice never counts twice.
//   {date, platform, amount}            one day, typed in (amount in cents)
//   {csv, platform, apply: false|true}  a spend sheet: checked first, saved on apply
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json().catch(() => ({}))
    const currency = await getStoreCurrency()

    if (typeof body.csv === 'string') {
      if (body.csv.length > 2_000_000) return json({ error: 'The file is too large (2 MB at most)' }, { status: 400 })
      const file = readSpendCsv(body.csv, String(body.platform || ''))
      if (file.rows.length > 1000) return json({ error: 'Up to 1,000 days per file' }, { status: 400 })
      const existing = file.rows.length ? await db.adSpend.findMany({ where: { OR: file.rows.map(r => ({ date: new Date(`${r.date}T00:00:00.000Z`), platform: r.platform })) }, select: { date: true, platform: true, amount: true } }) : []
      const before = new Map(existing.map(e => [`${e.date.toISOString().slice(0, 10)}|${e.platform}`, e.amount]))
      const rows = file.rows.map(r => ({ ...r, replaces: before.get(`${r.date}|${r.platform}`) ?? null }))
      const total = rows.reduce((sum, r) => sum + r.amount, 0)
      if (!body.apply) return json({ rows, errors: file.errors, dateOrder: file.dateOrder, total, currency })
      if (file.errors.length) return json({ error: 'Fix the problems in the file first', errors: file.errors }, { status: 400 })
      if (!rows.length) return json({ error: 'The file has no spend to save' }, { status: 400 })
      if (rows.some(r => r.amount > MAX_AMOUNT)) return json({ error: 'One of the amounts is too large' }, { status: 400 })
      // All days or none: a file that fails halfway leaves the spend as it was.
      await db.$transaction(async tx => {
        for (const r of rows) {
          const date = new Date(`${r.date}T00:00:00.000Z`)
          await tx.adSpend.upsert({ where: { date_platform: { date, platform: r.platform } }, update: { amount: r.amount, currency, createdById: actor.id }, create: { date, platform: r.platform, amount: r.amount, currency, createdById: actor.id, note: 'Imported' } })
        }
      }, { timeout: 60_000, maxWait: 10_000 })
      await audit(actor.id, 'ad_spend.imported', 'AdSpend', undefined, { days: rows.length, total, currency })
      return json({ saved: rows.length, total })
    }

    const date = parseSpendDate(String(body.date || ''))
    const platform = normalizePlatform(String(body.platform || ''))
    const amount = Math.trunc(Number(body.amount))
    if (!date) return json({ error: 'Choose a date' }, { status: 400 })
    if (!platform) return json({ error: 'Choose where the ads ran' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return json({ error: 'Enter the amount spent' }, { status: 400 })
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null
    const day = new Date(`${date}T00:00:00.000Z`)
    const previous = await db.adSpend.findUnique({ where: { date_platform: { date: day, platform } } })
    const row = await db.adSpend.upsert({ where: { date_platform: { date: day, platform } }, update: { amount, currency, note, createdById: actor.id }, create: { date: day, platform, amount, currency, note, createdById: actor.id } })
    await audit(actor.id, previous ? 'ad_spend.replaced' : 'ad_spend.added', 'AdSpend', row.id, { date, platform, amount, previous: previous?.amount ?? null })
    return json({ entry: { id: row.id, date, platform, amount, currency, note }, replaced: previous?.amount ?? null }, { status: previous ? 200 : 201 })
  } catch (e) { return routeError(e, 'Unable to save ad spend', 400) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const id = new URL(req.url).searchParams.get('id') || ''
    const row = id ? await db.adSpend.findUnique({ where: { id } }) : null
    if (!row) return json({ error: 'Not found' }, { status: 404 })
    await db.adSpend.delete({ where: { id } })
    await audit(actor.id, 'ad_spend.deleted', 'AdSpend', id, { date: row.date.toISOString().slice(0, 10), platform: row.platform, amount: row.amount })
    return json({ ok: true })
  } catch (e) { return routeError(e, 'Unable to delete', 400) }
}
