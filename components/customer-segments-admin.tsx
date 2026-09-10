'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, RefreshCw, Search, UsersRound, X } from 'lucide-react'
import styles from './admin-customer-segments.module.css'
import ui from './admin-ui.module.css'

type CustomerSegment = {
  id: string
  name: string
  description: string | null
  ruleJson: string
  createdAt: string
  updatedAt: string
  _count: { members: number }
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function CustomerSegmentsAdmin({ initial, canManage }: { initial: CustomerSegment[]; canManage: boolean }) {
  const [rows, setRows] = useState<CustomerSegment[]>(initial || [])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ruleJson, setRuleJson] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r => `${r.name} ${r.description || ''}`.toLowerCase().includes(needle))
  }, [rows, q])

  async function refresh() {
    setLoading(true); setError('')
    try { setRows(await api('/api/admin/customers/segments')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load segments') }
    finally { setLoading(false) }
  }

  function openModal() {
    setModalOpen(true); setName(''); setDescription(''); setRuleJson(''); setModalError('')
  }
  function closeModal() { setModalOpen(false) }

  async function createSegment() {
    const trimmedName = name.trim()
    if (!trimmedName) { setModalError('Segment name is required.'); return }
    let ruleJsonValue: string | undefined
    if (ruleJson.trim()) {
      try { JSON.parse(ruleJson.trim()); ruleJsonValue = ruleJson.trim() }
      catch { setModalError('Segment rule must be valid JSON.'); return }
    }
    setSubmitting(true); setModalError('')
    try {
      const data = await api('/api/admin/customers/segments', {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, description: description.trim() || undefined, ...(ruleJsonValue ? { ruleJson: ruleJsonValue } : {}) }),
      })
      const created: CustomerSegment = { ...data.segment, _count: { members: 0 } }
      setRows(current => [created, ...current])
      setNotice(`Segment “${created.name}” created.`)
      setModalOpen(false)
    } catch (e) { setModalError(e instanceof Error ? e.message : 'Unable to create segment') }
    finally { setSubmitting(false) }
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <Link href="/admin/customers" className={ui.textLink}><ArrowLeft size={13} /> Back to customers</Link>
        <h1 className={ui.heading}>Customer segments</h1>
        <p className={ui.muted}>Group customers for marketing, discounts and reporting. Assign customers to a segment from their customer profile.</p>
      </div>
      <div className="inline">
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        {canManage && <button className={ui.btn} onClick={openModal}><Plus size={15} /> New segment</button>}
      </div>
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`}>{error || notice}</div>}

    <div className={`${ui.card} ${styles.toolbar}`}>
      <div className={styles.search}><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search segments by name or description…" /></div>
    </div>

    <div className={ui.card}>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead><tr><th>Segment</th><th>Description</th><th>Members</th><th>Updated</th></tr></thead>
          <tbody>
            {shown.map(seg => <tr key={seg.id}>
              <td><strong>{seg.name}</strong></td>
              <td className={ui.muted}>{seg.description || '—'}</td>
              <td><span className={ui.pill}>{seg._count?.members ?? 0} customers</span></td>
              <td className={ui.muted}>{new Date(seg.updatedAt).toLocaleDateString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!shown.length && <div className={ui.empty}><UsersRound size={28} /><h3>No segments yet</h3><p className={ui.muted}>{canManage ? 'Create a segment to start grouping customers.' : 'Segments created by staff will show up here.'}</p></div>}
    </div>

    {modalOpen && <div className={ui.modalOverlay} onClick={closeModal}>
      <div className={`${ui.card} ${styles.modal}`} onClick={e => e.stopPropagation()}>
        <div className={ui.modalHead}>
          <div><span className={`${ui.muted} ${ui.tiny}`}>NEW SEGMENT</span><h2>Create a customer segment</h2><p className={ui.muted}>Segments can be assigned to customers individually from their profile.</p></div>
          <button className={ui.iconBtn} onClick={closeModal}><X size={17} /></button>
        </div>

        <div className={styles.modalBody}>
          {modalError && <div className={`${ui.alert} ${ui.alertDanger}`}>{modalError}</div>}
          <label className={ui.fieldLabel}>Name<input className={ui.input} value={name} onChange={e => setName(e.target.value)} placeholder="VIP customers" autoFocus /></label>
          <label className={ui.fieldLabel}>Description<textarea className={ui.textarea} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this segment represents" /></label>
          <label className={ui.fieldLabel}>Rule definition (JSON, optional)<textarea className={ui.textarea} rows={4} value={ruleJson} onChange={e => setRuleJson(e.target.value)} placeholder='{"minOrders": 5}' /></label>
          <div className={styles.modalFooter}>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={closeModal} disabled={submitting}>Cancel</button>
            <button className={ui.btn} onClick={createSegment} disabled={submitting}>{submitting ? 'Creating…' : 'Create segment'}</button>
          </div>
        </div>
      </div>
    </div>}
  </div>
}
