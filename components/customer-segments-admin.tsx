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

type ConditionField = 'totalSpent' | 'orderCount' | 'lastOrderDaysAgo' | 'accountAgeDays' | 'tag'
type ConditionOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq'
type Condition = { field: ConditionField; operator: ConditionOperator; value: string }

const FIELD_OPTIONS: { value: ConditionField; label: string; numeric: boolean }[] = [
  { value: 'totalSpent', label: 'Total spent (cents)', numeric: true },
  { value: 'orderCount', label: 'Order count', numeric: true },
  { value: 'lastOrderDaysAgo', label: 'Days since last order', numeric: true },
  { value: 'accountAgeDays', label: 'Account age (days)', numeric: true },
  { value: 'tag', label: 'Has tag', numeric: false },
]
const OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: 'gte', label: '≥' }, { value: 'lte', label: '≤' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' }, { value: 'eq', label: '=' },
]

// A segment created before this feature existed (or one left purely manual) stores ruleJson
// as "{}" -- {conditions: []} parses the same way, so both read as zero rules here.
function ruleConditionCount(ruleJson: string): number {
  try {
    const parsed = JSON.parse(ruleJson)
    return Array.isArray(parsed?.conditions) ? parsed.conditions.length : 0
  } catch { return 0 }
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
  const [conditions, setConditions] = useState<Condition[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [recomputingId, setRecomputingId] = useState('')

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
    setModalOpen(true); setName(''); setDescription(''); setConditions([]); setModalError('')
  }
  function closeModal() { setModalOpen(false) }

  function addCondition() { setConditions(c => [...c, { field: 'totalSpent', operator: 'gte', value: '' }]) }
  function updateCondition(index: number, patch: Partial<Condition>) { setConditions(c => c.map((cond, i) => i === index ? { ...cond, ...patch } : cond)) }
  function removeCondition(index: number) { setConditions(c => c.filter((_, i) => i !== index)) }

  async function createSegment() {
    const trimmedName = name.trim()
    if (!trimmedName) { setModalError('Segment name is required.'); return }
    const validConditions = conditions.filter(c => c.value.trim() !== '')
    if (conditions.length && !validConditions.length) { setModalError('Give each rule a value, or remove it.'); return }
    setSubmitting(true); setModalError('')
    try {
      const rules = { conditions: validConditions.map(c => {
        const numeric = FIELD_OPTIONS.find(f => f.value === c.field)?.numeric
        return { field: c.field, operator: c.operator, value: numeric ? Number(c.value) : c.value.trim() }
      }) }
      const data = await api('/api/admin/customers/segments', {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, description: description.trim() || undefined, rules }),
      })
      const created: CustomerSegment = { ...data.segment, _count: { members: data.ruleMatched || 0 } }
      setRows(current => [created, ...current])
      setNotice(validConditions.length ? `Segment "${created.name}" created — ${data.ruleMatched || 0} customer(s) matched the rules.` : `Segment "${created.name}" created.`)
      setModalOpen(false)
    } catch (e) { setModalError(e instanceof Error ? e.message : 'Unable to create segment') }
    finally { setSubmitting(false) }
  }

  async function recomputeSegment(segmentId: string, segmentName: string) {
    setRecomputingId(segmentId); setError(''); setNotice('')
    try {
      const data = await api(`/api/admin/customers/segments/${segmentId}/recompute`, { method: 'POST' })
      setRows(current => current.map(r => r.id === segmentId ? { ...r, _count: { members: r._count.members + (data.added || 0) } } : r))
      setNotice(`"${segmentName}": ${data.added || 0} new customer(s) matched and were added.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to recompute segment') }
    finally { setRecomputingId('') }
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
          <thead><tr><th>Segment</th><th>Description</th><th>Matching</th><th>Members</th><th>Updated</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {shown.map(seg => { const ruleCount = ruleConditionCount(seg.ruleJson); return <tr key={seg.id}>
              <td><strong>{seg.name}</strong></td>
              <td className={ui.muted}>{seg.description || '—'}</td>
              <td>{ruleCount ? <span className={ui.pill}>{ruleCount} rule{ruleCount === 1 ? '' : 's'}</span> : <span className={ui.muted}>Manual</span>}</td>
              <td><span className={ui.pill}>{seg._count?.members ?? 0} customers</span></td>
              <td className={ui.muted}>{new Date(seg.updatedAt).toLocaleDateString()}</td>
              {canManage && <td>{ruleCount > 0 && <button className={ui.textButton} onClick={() => recomputeSegment(seg.id, seg.name)} disabled={recomputingId === seg.id}>{recomputingId === seg.id ? 'Recomputing…' : 'Recompute'}</button>}</td>}
            </tr> })}
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

          <div>
            <span className={ui.fieldLabel}>Matching rules (optional)</span>
            <p className={ui.muted} style={{ marginTop: -6, marginBottom: 8 }}>A customer must match every rule below to be added automatically. Leave empty for a purely manual segment.</p>
            <div className={styles.ruleList}>
              {conditions.map((cond, i) => (
                <div className={styles.ruleRow} key={i}>
                  <select className={ui.select} value={cond.field} onChange={e => updateCondition(i, { field: e.target.value as ConditionField })}>
                    {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select className={ui.select} value={cond.operator} onChange={e => updateCondition(i, { operator: e.target.value as ConditionOperator })}>
                    {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className={ui.input} value={cond.value} onChange={e => updateCondition(i, { value: e.target.value })} placeholder={FIELD_OPTIONS.find(f => f.value === cond.field)?.numeric ? '0' : 'vip'} />
                  <button type="button" className={ui.iconBtn} onClick={() => removeCondition(i)} aria-label="Remove rule"><X size={15} /></button>
                </div>
              ))}
            </div>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={addCondition}><Plus size={13} /> Add rule</button>
          </div>

          <div className={styles.modalFooter}>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={closeModal} disabled={submitting}>Cancel</button>
            <button className={ui.btn} onClick={createSegment} disabled={submitting}>{submitting ? 'Creating…' : 'Create segment'}</button>
          </div>
        </div>
      </div>
    </div>}
  </div>
}
