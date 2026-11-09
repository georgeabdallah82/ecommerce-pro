'use client'

import { useState } from 'react'
import ui from './admin-ui.module.css'
import { useToast } from './admin-toast'
import { useConfirm } from './admin-confirm'

export type InquiryRow = {
  id: string; businessName: string; contactName: string; email: string; phone: string
  city: string | null; interest: string | null; message: string | null
  status: string; createdAt: string; handledAt: string | null
}

export const STATUS_LABEL: Record<string, string> = { NEW: 'New', CONTACTED: 'Contacted', WON: 'Won', NOT_A_FIT: 'Not a fit' }
const FILTERS = ['ALL', 'NEW', 'CONTACTED', 'WON', 'NOT_A_FIT'] as const

// The list of wholesale inquiries with a status for each one. Staff who may only view see the list;
// changing a status or deleting needs the customers-manage permission (canManage).
export default function WholesaleInquiriesAdmin({ rows: initial, canManage }: { rows: InquiryRow[]; canManage: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState(initial)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [busy, setBusy] = useState<string | null>(null)
  const shown = filter === 'ALL' ? rows : rows.filter(row => row.status === filter)

  async function setStatus(row: InquiryRow, status: string) {
    setBusy(row.id)
    try {
      const response = await fetch(`/api/admin/wholesale/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update this inquiry')
      setRows(current => current.map(r => r.id === row.id ? { ...r, status: data.status, handledAt: data.handledAt } : r))
      toast(`Marked as ${STATUS_LABEL[status]}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to update this inquiry', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove(row: InquiryRow) {
    if (!(await confirm({ title: `Delete the inquiry from ${row.businessName}?`, message: 'It is removed for good. Use this for tests or spam.', confirmLabel: 'Delete inquiry' }))) return
    setBusy(row.id)
    try {
      const response = await fetch(`/api/admin/wholesale/${encodeURIComponent(row.id)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to delete this inquiry')
      setRows(current => current.filter(r => r.id !== row.id))
      toast('Inquiry deleted')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to delete this inquiry', 'error')
    } finally {
      setBusy(null)
    }
  }

  const counts = (status: string) => (status === 'ALL' ? rows.length : rows.filter(r => r.status === status).length)

  return <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} role="group" aria-label="Show inquiries by status">
      {FILTERS.map(f => <button key={f} type="button" className={`${ui.btn} ${filter === f ? '' : ui.btnSecondary}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
        {f === 'ALL' ? 'All' : STATUS_LABEL[f]} <span className={ui.muted} style={filter === f ? { color: 'inherit' } : undefined}>{counts(f)}</span>
      </button>)}
    </div>
    <section className={ui.card} style={{ padding: 0, overflow: 'auto' }}>
      {shown.length ? <table className={ui.table}>
        <thead><tr><th>Received</th><th>Business</th><th>Contact</th><th>Interested in</th><th>Message</th><th>Status</th>{canManage ? <th /> : null}</tr></thead>
        <tbody>{shown.map(row => <tr key={row.id}>
          <td>{new Date(row.createdAt).toLocaleDateString('en-GB')}</td>
          <td><strong>{row.businessName}</strong>{row.city ? <div className={ui.muted}>{row.city}</div> : null}</td>
          <td><div>{row.contactName}</div><a href={`mailto:${row.email}`}>{row.email}</a><div><a href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}>{row.phone}</a></div></td>
          <td>{row.interest || '—'}</td>
          <td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{row.message || '—'}</td>
          <td>
            {canManage ? <select aria-label={`Status for ${row.businessName}`} className={ui.input} value={row.status} disabled={busy === row.id} onChange={e => setStatus(row, e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select> : <span>{STATUS_LABEL[row.status] || row.status}</span>}
          </td>
          {canManage ? <td><button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} disabled={busy === row.id} onClick={() => remove(row)}>Delete</button></td> : null}
        </tr>)}</tbody>
      </table> : <p className={ui.muted} style={{ padding: 16 }}>{rows.length ? 'No inquiries with this status.' : 'No wholesale inquiries yet.'}</p>}
    </section>
  </div>
}
