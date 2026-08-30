'use client'

import { Download, Upload, FileSpreadsheet } from 'lucide-react'
import { useRef, useState } from 'react'

const exports = [
  ['products', 'Products'],
  ['orders', 'Orders'],
  ['customers', 'Customers'],
] as const

export default function AdminDataTransfer({ canImport = false }: { canImport?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function download(type: string) {
    setBusy(`export:${type}`); setMessage(''); setError('')
    try {
      const response = await fetch(`/api/admin/exports?type=${type}`, { cache: 'no-store' })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Export failed') }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ecommerce-pro-${type}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
      setMessage(`${type[0].toUpperCase() + type.slice(1)} exported successfully.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed') } finally { setBusy('') }
  }

  async function importProducts(file: File) {
    setBusy('import'); setMessage(''); setError('')
    try {
      const form = new FormData(); form.append('file', file)
      const response = await fetch('/api/admin/imports?type=products', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Import failed')
      const detail = `${data.created || 0} created, ${data.updated || 0} updated${data.errors?.length ? `, ${data.errors.length} skipped` : ''}.`
      setMessage(`Products imported: ${detail}`)
      if (data.errors?.length) setError(data.errors.slice(0, 5).join(' • '))
      window.location.reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed') } finally { setBusy('') }
  }

  return <section className="card" style={{ padding: 18, marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><div className="metricIcon"><FileSpreadsheet size={18}/></div><div><strong style={{ display: 'block' }}>Data transfer</strong><span className="muted" style={{ fontSize: 12 }}>Export store data or import products from CSV.</span></div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {exports.map(([type, label]) => <button key={type} type="button" className="btn secondary" onClick={() => download(type)} disabled={Boolean(busy)}><Download size={15}/>{busy === `export:${type}` ? 'Exporting…' : `Export ${label}`}</button>)}
        {canImport && <><input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importProducts(file); event.currentTarget.value = '' }}/><button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}><Upload size={15}/>{busy === 'import' ? 'Importing…' : 'Import Products'}</button></>}
      </div>
    </div>
    {message && <div className="alert" style={{ marginTop: 12, marginBottom: 0 }}>{message}</div>}
    {error && <div className="alert danger" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
    {canImport && <p className="muted" style={{ margin: '10px 0 0', fontSize: 11 }}>Product import accepts the exported product CSV format. Existing SKUs are updated; new SKUs are created. Maximum 500 rows / 2 MB.</p>}
  </section>
}
