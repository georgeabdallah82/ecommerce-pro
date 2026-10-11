'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import styles from './spreadsheet-import.module.css'
import ui from './admin-ui.module.css'

type Scope = 'all' | 'view' | 'selected' | 'collection'

// Products › Export: which products go in the spreadsheet. The file opens in Excel or Google
// Sheets and can be imported back (app/api/admin/exports, Products › Import).
export default function ProductExportDialog({ onClose, total, selectedIds, status, q }: { onClose: () => void; total: number; selectedIds: string[]; status: string; q: string }) {
  const filtered = status !== 'ALL' || !!q.trim()
  const [scope, setScope] = useState<Scope>(selectedIds.length ? 'selected' : filtered ? 'view' : 'all')
  const [collections, setCollections] = useState<Array<{ id: string; name: string; _count?: { products: number } }>>([])
  const [collectionId, setCollectionId] = useState('')

  useEffect(() => {
    fetch('/api/admin/collections', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).then(list => { if (Array.isArray(list)) { setCollections(list); setCollectionId(list[0]?.id || '') } }).catch(() => undefined)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const params = new URLSearchParams({ type: 'products' })
  if (scope === 'view') { if (status !== 'ALL') params.set('status', status); if (q.trim()) params.set('q', q.trim()) }
  if (scope === 'selected') selectedIds.forEach(id => params.append('id', id))
  if (scope === 'collection' && collectionId) params.set('collectionId', collectionId)
  const viewLabel = [status !== 'ALL' ? `${status.charAt(0)}${status.slice(1).toLowerCase()} products` : '', q.trim() ? `matching “${q.trim()}”` : ''].filter(Boolean).join(' ')

  const options: Array<{ value: Scope; label: string; hint?: string; disabled?: boolean }> = [
    // The list's total counts what it shows, so with a filter on it belongs to "this view".
    { value: 'all', label: filtered ? 'All products' : `All products (${total})` },
    ...(filtered ? [{ value: 'view' as Scope, label: `The products in this view (${total})`, hint: viewLabel }] : []),
    { value: 'selected', label: `Selected products (${selectedIds.length})`, hint: selectedIds.length ? undefined : 'Tick products in the list first', disabled: !selectedIds.length },
    { value: 'collection', label: 'One collection', disabled: !collections.length },
  ]

  return (
    <div className={ui.modalOverlay} onClick={onClose}>
      <div className={`${ui.modal} ${styles.dialog}`} role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={e => e.stopPropagation()}>
        <div className={ui.modalHead}>
          <div>
            <h2 id="export-title">Export products</h2>
            <p className={ui.muted}>A spreadsheet (CSV) for Excel or Google Sheets. Change it and import it back from Products › Import.</p>
          </div>
          <button type="button" className={ui.iconBtn} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className={styles.dialogBody}>
          <div className={styles.choices} role="radiogroup" aria-label="Which products">
            {options.map(option => (
              <label key={option.value} className={`${styles.choice} ${scope === option.value ? styles.choiceOn : ''} ${option.disabled ? styles.choiceOff : ''}`}>
                <input type="radio" name="export-scope" checked={scope === option.value} disabled={option.disabled} onChange={() => setScope(option.value)} />
                <span>{option.label}{option.hint && <small>{option.hint}</small>}</span>
              </label>
            ))}
          </div>
          {scope === 'collection' && (
            <select className={ui.select} value={collectionId} onChange={e => setCollectionId(e.target.value)} aria-label="Collection">
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}{c._count ? ` (${c._count.products})` : ''}</option>)}
            </select>
          )}
          <div className={styles.foot}>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose}>Cancel</button>
            <a className={ui.btn} href={`/api/admin/exports?${params.toString()}`} onClick={() => window.setTimeout(onClose, 300)}><Download size={15} /> Download spreadsheet</a>
          </div>
        </div>
      </div>
    </div>
  )
}
