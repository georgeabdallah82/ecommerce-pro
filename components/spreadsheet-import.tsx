'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { useConfirm } from './admin-confirm'
import type { ImportMode, PlanEntry, PlanSummary } from '@/lib/catalog-csv'
import styles from './spreadsheet-import.module.css'
import ui from './admin-ui.module.css'

type Kind = 'products' | 'collections'
type Preview = { plan: PlanEntry[]; summary: PlanSummary; ignored: string[]; backupSkus: string[] }
type Result = { created: number; updated: number; unchanged: number; skipped: number }

const ACTION_LABEL: Record<PlanEntry['action'], string> = { create: 'New', update: 'Update', unchanged: 'No change', skip: 'Skipped', error: 'Problem' }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const GUIDE: Record<Kind, Array<[string, string]>> = {
  products: [
    ['SKU', 'Needed on every row. It is how a row finds its product: an existing SKU updates that product, a new SKU adds one.'],
    ['Name', 'Needed for new products.'],
    ['Price, Compare-at price, Cost price', 'Written like 45.00.'],
    ['Status', 'Active, Draft or Archived.'],
    ['Stock, Low stock at', 'Numbers. Stock only changes when you tick "Update stock".'],
    ['Collections, Tags', 'Separate several with | (for example: Kitchenware | New in). Collections must already exist.'],
    ['Featured, Track stock, Sell when out of stock…', 'Yes or No.'],
    ['Option of SKU, Option SKU, Option name, Option values, Option price, Option stock', 'For products with options (sizes, colours): one extra row per option, with the product’s SKU in "Option of SKU". Option values look like Size:M|Color:Red.'],
  ],
  collections: [
    ['Name', 'Needed for new collections. A row finds its collection by URL handle (made from the name if empty).'],
    ['Visible', 'Yes or No.'],
    ['Product SKUs', 'The products in the collection, in order, separated by |. If filled in, it replaces the collection’s products.'],
    ['Sort order, Description, Image', 'Optional.'],
  ],
}

// Products › Import › From a spreadsheet, and Collections › Import. Choose the file and what the
// import may do; the store answers with what every row would do (app/api/admin/imports, mode=preview);
// nothing is saved until "Import" is tapped and confirmed, and any row with a problem blocks it.
export default function SpreadsheetImport({ kind }: { kind: Kind }) {
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>('all')
  const [newAsDraft, setNewAsDraft] = useState(true)
  const [updateStock, setUpdateStock] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [filter, setFilter] = useState<'all' | PlanEntry['action']>('all')
  const [busy, setBusy] = useState<'' | 'check' | 'import'>('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const thing = kind === 'products' ? 'product' : 'collection'

  function form(target: File, next = { mode, newAsDraft, updateStock }) {
    const body = new FormData()
    body.append('file', target)
    body.append('importMode', next.mode)
    body.append('newAsDraft', String(next.newAsDraft))
    body.append('updateStock', String(next.updateStock))
    return body
  }

  async function check(target: File, next = { mode, newAsDraft, updateStock }) {
    setBusy('check'); setError(''); setResult(null)
    try {
      const response = await fetch(`/api/admin/imports?type=${kind}&mode=preview`, { method: 'POST', body: form(target, next) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The file could not be checked.')
      setPreview(data)
      setFilter('all')
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : 'The file could not be checked.')
    } finally {
      setBusy('')
    }
  }

  function choose(next: File | null) {
    setFile(next)
    if (next) void check(next)
  }

  // Changing what the import may do re-checks the same file, so the plan always matches.
  function setOption(next: { mode?: ImportMode; newAsDraft?: boolean; updateStock?: boolean }) {
    const merged = { mode: next.mode ?? mode, newAsDraft: next.newAsDraft ?? newAsDraft, updateStock: next.updateStock ?? updateStock }
    setMode(merged.mode); setNewAsDraft(merged.newAsDraft); setUpdateStock(merged.updateStock)
    if (file) void check(file, merged)
  }

  async function runImport() {
    if (!file || !preview) return
    const { create, update } = preview.summary
    const ok = await confirm({
      title: `Import ${plural(create + update, thing)}?`,
      message: [
        create ? `${plural(create, `new ${thing}`)} will be added${kind === 'products' && newAsDraft ? ' as Draft (not on your store until you publish them)' : ''}.` : '',
        update ? `${plural(update, thing)} will change exactly as listed.` : '',
        update && kind === 'products' ? 'This can’t be undone with one tap: download the backup first if you may want to go back.' : '',
      ].filter(Boolean).join(' '),
      confirmLabel: 'Import',
      tone: 'default',
    })
    if (!ok) return
    setBusy('import'); setError('')
    try {
      const response = await fetch(`/api/admin/imports?type=${kind}&mode=apply`, { method: 'POST', body: form(file) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.plan) setPreview(current => (current ? { ...current, plan: data.plan, summary: data.summary } : current))
        throw new Error(data.error || 'The import did not go through. Nothing was changed.')
      }
      setResult({ created: data.created || 0, updated: data.updated || 0, unchanged: data.unchanged || 0, skipped: data.skipped || 0 })
      setPreview(null)
      setFile(null)
      if (input.current) input.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import did not go through. Nothing was changed.')
    } finally {
      setBusy('')
    }
  }

  function reset() {
    setFile(null); setPreview(null); setResult(null); setError('')
    if (input.current) input.current.value = ''
  }

  const summary = preview?.summary
  const changes = summary ? summary.create + summary.update : 0
  const rows = preview ? preview.plan.filter(p => filter === 'all' || p.action === filter) : []
  const backupHref = preview?.backupSkus.length ? `/api/admin/exports?type=products&${preview.backupSkus.map(s => `sku=${encodeURIComponent(s)}`).join('&')}` : kind === 'collections' && summary?.update ? '/api/admin/exports?type=collections' : ''

  if (result) {
    return (
      <section className={`${ui.card} ${styles.card}`}>
        <div className={styles.done}>
          <CheckCircle2 size={28} />
          <div>
            <h3>Import finished</h3>
            <p>{[result.created && `${plural(result.created, thing)} added`, result.updated && `${plural(result.updated, thing)} updated`, result.unchanged && `${result.unchanged} unchanged`, result.skipped && `${result.skipped} skipped`].filter(Boolean).join(' · ') || 'Nothing needed to change.'}</p>
          </div>
        </div>
        <div className={styles.row}>
          <Link className={ui.btn} href={kind === 'products' ? '/admin/products' : '/admin/collections'}>View {kind}</Link>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={reset}><RotateCcw size={15} /> Import another file</button>
        </div>
      </section>
    )
  }

  return (
    <div className={styles.wrap}>
      <section className={`${ui.card} ${styles.card}`}>
        <h3><span className={styles.step}>1</span> Get your spreadsheet</h3>
        <p className={ui.muted}>Start from the empty template to add {kind}, or export your {kind} to change them. Open the file in Excel or Google Sheets, edit it, and save it as <strong>CSV</strong>.</p>
        <div className={styles.row}>
          <a className={`${ui.btn} ${ui.btnSecondary}`} href={`/api/admin/exports?type=${kind}&template=1`}><Download size={15} /> Empty template</a>
          <a className={`${ui.btn} ${ui.btnSecondary}`} href={`/api/admin/exports?type=${kind}`}><FileSpreadsheet size={15} /> Export all {kind}</a>
        </div>
        <p className={styles.tip}>Only the columns in your file are changed, and empty cells are left as they are.{kind === 'products' ? ' To change prices, a file with just SKU and Price is enough.' : ''}</p>
        <details className={styles.guide}>
          <summary>What each column means</summary>
          <dl>{GUIDE[kind].map(([name, help]) => <div key={name}><dt>{name}</dt><dd>{help}</dd></div>)}</dl>
        </details>
      </section>

      <section className={`${ui.card} ${styles.card}`}>
        <h3><span className={styles.step}>2</span> Choose what the import may do</h3>
        <div className={styles.choices} role="radiogroup" aria-label="What the import may do">
          {([['all', `Add new ${kind} and update existing ones`], ['new', `Only add new ${kind}`], ['update', `Only update existing ${kind}`]] as Array<[ImportMode, string]>).map(([value, label]) => (
            <label key={value} className={`${styles.choice} ${mode === value ? styles.choiceOn : ''}`}>
              <input type="radio" name={`import-mode-${kind}`} checked={mode === value} onChange={() => setOption({ mode: value })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {kind === 'products' && (
          <div className={styles.checks}>
            <label><input type="checkbox" checked={newAsDraft} onChange={e => setOption({ newAsDraft: e.target.checked })} /> <span><strong>Save new products as Draft</strong><small>They stay off your store until you publish them.</small></span></label>
            <label><input type="checkbox" checked={updateStock} onChange={e => setOption({ updateStock: e.target.checked })} /> <span><strong>Update stock</strong><small>Set stock to the numbers in the "Stock" column. Off: stock is only set for new products.</small></span></label>
          </div>
        )}
        <div className={styles.row}>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={e => choose(e.target.files?.[0] || null)} />
          <button type="button" className={ui.btn} onClick={() => input.current?.click()} disabled={!!busy}><Upload size={15} /> {file ? 'Choose another file' : 'Choose CSV file'}</button>
          {file && <span className={styles.fileName}>{file.name}</span>}
          {busy === 'check' && <span className={ui.muted}>Checking…</span>}
        </div>
      </section>

      {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}

      {preview && summary && (
        <section className={`${ui.card} ${styles.card}`}>
          <h3><span className={styles.step}>3</span> Check, then import</h3>
          <div className={styles.chips}>
            {([['all', 'All rows', preview.plan.length], ['create', 'New', summary.create], ['update', 'Updates', summary.update], ['unchanged', 'No change', summary.unchanged], ['skip', 'Skipped', summary.skip], ['error', 'Problems', summary.error]] as Array<['all' | PlanEntry['action'], string, number]>)
              .filter(([value, , count]) => value === 'all' || count > 0)
              .map(([value, label, count]) => (
                <button key={value} type="button" className={`${styles.chip} ${styles[`chip_${value}`] || ''} ${filter === value ? styles.chipOn : ''}`} onClick={() => setFilter(value)}>{label} <b>{count}</b></button>
              ))}
          </div>
          {preview.ignored.length > 0 && <p className={styles.note}>These columns aren’t recognised and will be ignored: {preview.ignored.join(', ')}.</p>}
          {summary.error > 0 && <div className={`${ui.alert} ${ui.alertDanger}`}>{plural(summary.error, 'row has', 'rows have')} a problem. Fix {summary.error === 1 ? 'it' : 'them'} in your file and choose it again: nothing is imported until every row is fine.</div>}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Row</th><th>{kind === 'products' ? 'Product' : 'Collection'}</th><th>What happens</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map(entry => (
                  <tr key={`${entry.line}-${entry.sku}`}>
                    <td className={styles.line}>{entry.line}</td>
                    <td><strong>{entry.name || '—'}</strong>{entry.sku && <small>{entry.sku}</small>}</td>
                    <td><span className={`${styles.tag} ${styles[`tag_${entry.action}`]}`}>{ACTION_LABEL[entry.action]}</span></td>
                    <td className={styles.details}>
                      {entry.errors.map(e => <p key={e} className={styles.err}>{e}</p>)}
                      {entry.changes.map(c => <p key={c.label}>{c.from ? <>{c.label}: <s>{c.from}</s> → <b>{c.to}</b></> : <>{c.label}: <b>{c.to}</b></>}</p>)}
                      {entry.notes.map(n => <p key={n} className={styles.dim}>{n}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.foot}>
            {backupHref && <a className={`${ui.btn} ${ui.btnSecondary}`} href={backupHref}><Download size={15} /> Download a backup first</a>}
            <button type="button" className={ui.btn} onClick={runImport} disabled={!!busy || summary.error > 0 || changes === 0}>
              {busy === 'import' ? 'Importing…' : changes === 0 ? 'Nothing to import' : `Import ${plural(changes, thing)}`}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
