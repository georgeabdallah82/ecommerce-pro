'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Trash2, Upload } from 'lucide-react'
import { money } from '@/lib/config'
import { parseMoney } from '@/lib/catalog-csv'
import { AD_PLATFORMS, type ProfitReport as Report } from '@/lib/profit'
import { useConfirm } from './admin-confirm'
import ui from './admin-ui.module.css'
import s from './admin-profit.module.css'

type Spend = { id: string; date: string; platform: string; amount: number; currency: string; note: string | null }
type Data = { range: { since: string; until: string; days: number }; report: Report; adSpend: Spend[]; canEdit: boolean; truncated: boolean }
type Preview = { rows: { line: number; date: string; platform: string; amount: number; replaces: number | null }[]; errors: { line: number; message: string }[]; dateOrder: 'dmy' | 'mdy'; total: number; currency: string }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

const centsText = (cents: number | null | undefined) => cents == null ? '' : (cents / 100).toFixed(2)
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// Reports > Profit: the store's money over the chosen dates, line by line, with the costs the
// owner enters (delivery and packaging per order, ad spend). Anything not entered says so.
export default function ProfitReport({ query, reloadKey }: { query: string; reloadKey: number }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [delivery, setDelivery] = useState('')
  const [packaging, setPackaging] = useState('')
  const [savingCosts, setSavingCosts] = useState(false)
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [spendPlatform, setSpendPlatform] = useState<string>('Meta')
  const [spendAmount, setSpendAmount] = useState('')
  const [savingSpend, setSavingSpend] = useState(false)
  const [csv, setCsv] = useState('')
  const [csvName, setCsvName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const confirm = useConfirm()

  async function load() {
    setLoading(true); setError('')
    try {
      const d: Data = await api(`/api/admin/reports/profit?${query}`)
      setData(d)
      setDelivery(centsText(d.report.delivery.perOrder))
      setPackaging(centsText(d.report.packaging.perOrder))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load the profit report') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [query, reloadKey])

  async function saveCosts() {
    const read = (v: string) => { if (!v.trim()) return ''; const c = parseMoney(v.trim()); return c === null ? null : String(c) }
    const d = read(delivery), p = read(packaging)
    if (d === null || p === null) { setMsg('Write the costs as amounts, like 3 or 2.50 (or leave empty if you do not know yet).'); return }
    setSavingCosts(true); setMsg('')
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings: { 'profit.deliveryCostPerOrder': d, 'profit.packagingCostPerOrder': p } }) })
      setMsg('Costs saved.'); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to save') }
    finally { setSavingCosts(false) }
  }

  async function addSpend() {
    const amount = parseMoney(spendAmount.trim())
    if (!amount) { setMsg('Enter the amount spent, like 25 or 12.50.'); return }
    setSavingSpend(true); setMsg('')
    try {
      const d = await api('/api/admin/reports/ad-spend', { method: 'POST', body: JSON.stringify({ date: spendDate, platform: spendPlatform, amount }) })
      setSpendAmount('')
      setMsg(d.replaced != null ? `${spendPlatform} on ${spendDate} was ${money(d.replaced)}; it is now ${money(amount)}.` : 'Ad spend added.')
      await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to save') }
    finally { setSavingSpend(false) }
  }

  async function removeSpend(entry: Spend) {
    if (!(await confirm({ title: 'Delete this ad spend?', message: `${entry.platform}, ${entry.date}: ${money(entry.amount, entry.currency)}`, confirmLabel: 'Delete' }))) return
    try { await api(`/api/admin/reports/ad-spend?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' }); await load() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to delete') }
  }

  async function readFile(file: File | undefined) {
    setPreview(null); setMsg('')
    if (!file) return
    const text = await file.text()
    setCsv(text); setCsvName(file.name)
    try { setPreview(await api('/api/admin/reports/ad-spend', { method: 'POST', body: JSON.stringify({ csv: text, platform: spendPlatform, apply: false }) })) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to read the file') }
  }

  async function applyImport() {
    setImporting(true); setMsg('')
    try {
      const d = await api('/api/admin/reports/ad-spend', { method: 'POST', body: JSON.stringify({ csv, platform: spendPlatform, apply: true }) })
      setMsg(`Saved ${d.saved} day${d.saved === 1 ? '' : 's'} of ad spend (${money(d.total)}).`)
      setPreview(null); setCsv(''); setCsvName(''); if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to import') }
    finally { setImporting(false) }
  }

  if (loading && !data) return <div className={`${ui.card} ${s.skeleton}`} />
  if (error) return <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>
  if (!data) return null
  const r = data.report
  const m = (cents: number) => money(cents, r.currency)
  const lastDay = new Date(new Date(data.range.until).getTime() - 86400000).toISOString()
  const notEntered = <span className={s.notEntered}>Not entered</span>

  return <div className={s.wrap}>
    <p className={ui.muted}>{dayLabel(data.range.since)} to {dayLabel(lastDay)} · amounts in {r.currency} · days in UTC · {r.ordersPlaced} order{r.ordersPlaced === 1 ? '' : 's'} placed</p>
    {msg && <div className={ui.alert}>{msg}</div>}
    {r.estimated && <div className={s.estimate}><AlertTriangle size={16} /><div><strong>This profit is an estimate, probably too high.</strong><ul>{r.missing.map(x => <li key={x}>{x}</li>)}</ul></div></div>}
    {r.otherCurrencyOrders > 0 && <div className={s.estimate}><AlertTriangle size={16} /><div>{r.otherCurrencyOrders} order{r.otherCurrencyOrders === 1 ? ' is' : 's are'} in another currency and not counted here.</div></div>}
    {data.truncated && <div className={s.estimate}><AlertTriangle size={16} /><div>Only the first 20,000 orders are counted. Choose fewer days.</div></div>}

    <div className={s.big}>
      <div className={`${ui.card} ${s.bigCard}`}><span className={ui.muted}>Profit from money collected</span><strong className={r.profit.collectedSoFar < 0 ? s.negative : ''}>{m(r.profit.collectedSoFar)}</strong><small className={ui.muted}>Paid orders only, after costs and ads</small></div>
      <div className={`${ui.card} ${s.bigCard}`}><span className={ui.muted}>If unpaid orders are collected</span><strong className={r.profit.ifUnpaidCollected < 0 ? s.negative : ''}>{m(r.profit.ifUnpaidCollected)}</strong><small className={ui.muted}>Adds open cash on delivery and unpaid orders</small></div>
    </div>

    <section className={`${ui.card} ${s.card}`}>
      <h3>Where the money went</h3>
      <div className={s.lines}>
        <Line label="Orders placed (gross order value)" value={m(r.grossOrderValue)} />
        <Line label={`Cancelled (${r.cancelled.orders} order${r.cancelled.orders === 1 ? '' : 's'})`} value={`- ${m(r.cancelled.value)}`} />
        <Line label="Refunded" value={`- ${m(r.refunded)}`} />
        <Line label="Net sales" value={m(r.netSales)} strong />
        <Line sub label={`Collected (${r.collected.orders} paid order${r.collected.orders === 1 ? '' : 's'})`} value={m(r.collected.sales)} />
        <Line sub label={`Cash on delivery not collected yet (${r.unpaidCod.orders})`} value={m(r.unpaidCod.sales)} />
        <Line sub label={`Other unpaid: card or bank not paid (${r.unpaidOther.orders})`} value={m(r.unpaidOther.sales)} />
        <Line label="Tax inside the sales (not yours to keep)" value={`- ${m(r.taxIncluded)}`} />
        <Line label="Product cost" value={<>- {m(r.productCost.total)}{r.productCost.missing.length > 0 && <span className={s.notEntered}> + not entered for {r.productCost.missing.length}</span>}</>} />
        <Line label={r.delivery.perOrder == null ? 'Delivery cost' : `Delivery (${r.delivery.orders} x ${m(r.delivery.perOrder)})`} value={r.delivery.total == null ? notEntered : `- ${m(r.delivery.total)}`} />
        <Line label={r.packaging.perOrder == null ? 'Packaging cost' : `Packaging (${r.packaging.orders} x ${m(r.packaging.perOrder)})`} value={r.packaging.total == null ? notEntered : `- ${m(r.packaging.total)}`} />
        <Line label={`Ad spend${r.adSpend.byPlatform.length ? ` (${r.adSpend.byPlatform.map(p => `${p.platform} ${m(p.total)}`).join(', ')})` : ''}`} value={r.adSpend.entries ? `- ${m(r.adSpend.total)}` : <span className={s.notEntered}>None entered</span>} />
        <Line label="Profit if unpaid orders are collected" value={m(r.profit.ifUnpaidCollected)} strong />
      </div>
      <p className={`${ui.muted} ${s.note}`}>Delivery charged to customers ({m(r.shippingCharged)}) is part of sales. Discounts given: {m(r.discounts)}. Product cost uses each product&apos;s cost today. Delivery and packaging count every order that was not cancelled or fully refunded.</p>
    </section>

    {r.productCost.missing.length > 0 && <section className={`${ui.card} ${s.card}`}>
      <h3>Products sold without a cost</h3>
      <p className={ui.muted}>Add what you paid for each one (product page, &quot;Cost per item&quot;) and this report becomes exact. {m(r.productCost.missingSales)} of sales have no cost.</p>
      <div className={s.lines}>{r.productCost.missing.slice(0, 20).map(p => <div className={s.line} key={p.productId}><Link className={ui.textLink} href={`/admin/products/${p.productId}`}>{p.name}</Link><span>{p.units} sold · {m(p.sales)}</span></div>)}</div>
    </section>}

    <section className={`${ui.card} ${s.card}`}>
      <h3>Costs per order</h3>
      <p className={ui.muted}>What you pay for each order you send: the driver or delivery company, and the bag or box. Leave empty if you don&apos;t know yet.</p>
      <div className={s.form}>
        <label className={ui.fieldLabel}>Delivery cost per order ({r.currency})<input className={ui.input} inputMode="decimal" value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="Not entered" disabled={!data.canEdit} /></label>
        <label className={ui.fieldLabel}>Packaging per order ({r.currency})<input className={ui.input} inputMode="decimal" value={packaging} onChange={e => setPackaging(e.target.value)} placeholder="Not entered" disabled={!data.canEdit} /></label>
        {data.canEdit && <button type="button" className={ui.btn} onClick={saveCosts} disabled={savingCosts}>{savingCosts ? 'Saving...' : 'Save costs'}</button>}
      </div>
      {!data.canEdit && <p className={ui.muted}>Only the store owner can change these.</p>}
    </section>

    <section className={`${ui.card} ${s.card}`}>
      <h3>Ad spend</h3>
      <p className={ui.muted}>What you spent on ads, per day. Saving the same day and platform again replaces it.</p>
      {data.canEdit && <>
        <div className={s.form}>
          <label className={ui.fieldLabel}>Day<input className={ui.input} type="date" value={spendDate} onChange={e => setSpendDate(e.target.value)} /></label>
          <label className={ui.fieldLabel}>Where<select className={ui.select} value={spendPlatform} onChange={e => setSpendPlatform(e.target.value)}>{AD_PLATFORMS.map(p => <option key={p} value={p}>{p === 'Meta' ? 'Meta (Facebook, Instagram)' : p}</option>)}</select></label>
          <label className={ui.fieldLabel}>Amount ({r.currency})<input className={ui.input} inputMode="decimal" value={spendAmount} onChange={e => setSpendAmount(e.target.value)} placeholder="25.00" /></label>
          <button type="button" className={ui.btn} onClick={addSpend} disabled={savingSpend}>{savingSpend ? 'Saving...' : 'Add'}</button>
        </div>
        <div className={s.importBox}>
          <label className={`${ui.btn} ${ui.btnSecondary}`}><Upload size={15} /> Import a spend file (CSV)<input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => readFile(e.target.files?.[0])} /></label>
          <span className={ui.muted}>Columns: Date, Amount, and Platform (or the one chosen above). A Meta Ads export works as it is.</span>
        </div>
        {preview && <div className={s.preview}>
          <strong>{csvName}: {preview.rows.length} day{preview.rows.length === 1 ? '' : 's'}, {money(preview.total, preview.currency)} in total</strong>
          <span className={ui.muted}>Dates read as {preview.dateOrder === 'mdy' ? 'month/day/year' : 'day/month/year'}.</span>
          {preview.errors.length > 0 && <div className={`${ui.alert} ${ui.alertDanger}`}>Fix these in the file, then choose it again:<ul>{preview.errors.slice(0, 10).map(e => <li key={`${e.line}-${e.message}`}>Row {e.line}: {e.message}</li>)}</ul></div>}
          <div className={s.lines}>{preview.rows.slice(0, 31).map(row => <div className={s.line} key={`${row.date}-${row.platform}`}><span>{row.date} · {row.platform}</span><span>{money(row.amount, preview.currency)}{row.replaces != null && <small className={ui.muted}> (replaces {money(row.replaces, preview.currency)})</small>}</span></div>)}{preview.rows.length > 31 && <span className={ui.muted}>and {preview.rows.length - 31} more days</span>}</div>
          <div className="inline"><button type="button" className={ui.btn} onClick={applyImport} disabled={importing || !!preview.errors.length || !preview.rows.length}>{importing ? 'Saving...' : 'Save this spend'}</button><button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>Cancel</button></div>
        </div>}
      </>}
      <div className={s.lines}>
        {data.adSpend.map(a => <div className={s.line} key={a.id}><span>{a.date} · {a.platform}{a.note ? <small className={ui.muted}> · {a.note}</small> : null}</span><span className="inline">{money(a.amount, a.currency)}{data.canEdit && <button type="button" className={ui.textButton} aria-label={`Delete ${a.platform} ${a.date}`} onClick={() => removeSpend(a)}><Trash2 size={14} /></button>}</span></div>)}
        {!data.adSpend.length && <p className={ui.muted}>No ad spend entered for these dates.</p>}
      </div>
    </section>
  </div>
}

function Line({ label, value, strong, sub }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; sub?: boolean }) {
  return <div className={`${s.line} ${strong ? s.lineStrong : ''} ${sub ? s.lineSub : ''}`}><span>{label}</span><span>{value}</span></div>
}
