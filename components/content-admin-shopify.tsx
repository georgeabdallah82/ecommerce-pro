'use client'

import { useMemo, useState } from 'react'
import { Eye, FileText, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'

type Block = {
  id: string
  type: string
  title: string | null
  subtitle: string | null
  contentJson: string
  isActive: boolean
  sortOrder: number
  updatedAt?: string
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

const TYPES = ['text', 'hero', 'banner', 'rich_text', 'image', 'products', 'custom']

export function ContentAdminShopify({ initial, canManage = true }: { initial: Block[]; canManage?: boolean }) {
  const [rows, setRows] = useState(initial || [])
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'inactive'>('all')
  const [editing, setEditing] = useState<Block | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(block => {
      const matchesTab = activeTab === 'all' || (activeTab === 'active' ? block.isActive : !block.isActive)
      const text = `${block.title || ''} ${block.subtitle || ''} ${block.type}`.toLowerCase()
      return matchesTab && (!q || text.includes(q))
    })
  }, [rows, query, activeTab])

  async function refresh() {
    setError(''); setNotice('')
    try {
      const next = await api('/api/admin/content')
      setRows(Array.isArray(next) ? next : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load content')
    }
  }

  async function save(block: Block, close = true) {
    setBusy(block.id || 'new'); setError(''); setNotice('')
    try {
      const isNew = block.id === 'new'
      const payload = { type: block.type, title: block.title, subtitle: block.subtitle, contentJson: block.contentJson, isActive: block.isActive, sortOrder: block.sortOrder }
      if (isNew) await api('/api/admin/content', { method: 'POST', body: JSON.stringify(payload) })
      else await api('/api/admin/content', { method: 'PATCH', body: JSON.stringify({ id: block.id, ...payload }) })
      await refresh()
      setNotice(isNew ? 'Content block created.' : 'Content block saved.')
      if (close) { setEditing(null); setCreateOpen(false) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save content')
    } finally { setBusy(null) }
  }

  async function toggle(block: Block) {
    await save({ ...block, isActive: !block.isActive }, false)
    setNotice(`${block.title || block.type} is now ${!block.isActive ? 'active' : 'inactive'}.`)
  }

  async function remove(block: Block) {
    if (!confirm(`Delete "${block.title || block.type}"? This cannot be undone.`)) return
    setBusy(block.id); setError(''); setNotice('')
    try {
      await api(`/api/admin/content?id=${encodeURIComponent(block.id)}`, { method: 'DELETE' })
      setRows(rows.filter(x => x.id !== block.id))
      setNotice('Content block deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete content')
    } finally { setBusy(null) }
  }

  function openCreate() {
    setError(''); setNotice('')
    setEditing({ id: 'new', type: 'text', title: '', subtitle: '', contentJson: '{\n  "text": ""\n}', isActive: true, sortOrder: rows.length })
    setCreateOpen(true)
  }

  return <div className="catalogPage contentAdminPage">
    <div className={`${ui.sectionHead} catalogHead`}>
      <div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>Content</h1><p className={ui.muted}>Manage homepage sections and reusable storefront content blocks.</p></div>
      <div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={busy !== null}><RefreshCw size={15}/> Refresh</button>{canManage && <button className={ui.btn} onClick={openCreate}><Plus size={15}/> Add content</button>}</div>
    </div>
    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert}>{error || notice}</div>}

    <div className={`${ui.card} orderViews`}><button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>All <span>{rows.length}</span></button><button className={activeTab === 'active' ? 'active' : ''} onClick={() => setActiveTab('active')}>Active <span>{rows.filter(x => x.isActive).length}</span></button><button className={activeTab === 'inactive' ? 'active' : ''} onClick={() => setActiveTab('inactive')}>Inactive <span>{rows.filter(x => !x.isActive).length}</span></button></div>

    <div className={`${ui.card} catalogToolbar`}><div className="productSearch"><FileText size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search content, title, type…"/>{query && <button className="searchClear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14}/></button>}</div><span className={`${ui.muted} toolbarCount`}>{shown.length} block{shown.length === 1 ? '' : 's'}</span></div>

    <div className={`${ui.card} productTableCard`}><div className={ui.tableWrap}><table className={`${ui.table} productTable`}><thead><tr><th>Content</th><th>Type</th><th>Status</th><th>Order</th><th>Updated</th><th></th></tr></thead><tbody>{shown.map(block => <tr key={block.id}><td><strong>{block.title || 'Untitled block'}</strong><div className={ui.muted}>{block.subtitle || 'No subtitle'}</div></td><td><span className={ui.statusPill}>{block.type}</span></td><td>{canManage ? <button className="iconTextBtn" onClick={() => toggle(block)} disabled={busy === block.id}>{block.isActive ? <><ToggleRight size={16}/> Active</> : <><ToggleLeft size={16}/> Inactive</>}</button> : <span className={block.isActive ? `${ui.statusPill} ${ui.statusPillSuccess}` : ui.statusPill}>{block.isActive ? 'Active' : 'Inactive'}</span>}</td><td>{block.sortOrder}</td><td className={ui.muted}>{block.updatedAt ? new Date(block.updatedAt).toLocaleString() : '—'}</td><td><div className="inline"><button className={ui.iconBtn} title="Preview" onClick={() => setEditing(block)}><Eye size={15}/></button>{canManage && <button className={ui.iconBtn} title="Edit" onClick={() => setEditing(block)}><FileText size={15}/></button>}{canManage && <button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete" disabled={busy === block.id} onClick={() => remove(block)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table></div>{!shown.length && <div className={ui.empty}><FileText size={28}/><h3>No content found</h3><p className={ui.muted}>Create a block or change the current filter.</p></div>}</div>

    {editing && <div className={ui.modalOverlay} onClick={() => { if (!busy) { setEditing(null); setCreateOpen(false) } }}><div className={`${ui.card} contentModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>{createOpen ? 'NEW CONTENT' : 'CONTENT BLOCK'}</span><h2>{createOpen ? 'Add content' : canManage ? 'Edit content' : 'Content block'}</h2><p className={ui.muted}>{canManage ? 'Configure the block used by the storefront homepage.' : 'You have view-only access to content blocks.'}</p></div><button className={ui.iconBtn} onClick={() => setEditing(null)} disabled={busy !== null}><X size={17}/></button></div><div className="grid twoColumn"><label className={ui.fieldLabel}>Type<select className={ui.input} disabled={!canManage} value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label><label className={ui.fieldLabel}>Sort order<input className={ui.input} type="number" disabled={!canManage} value={editing.sortOrder} onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) || 0 })}/></label></div><label className={ui.fieldLabel}>Title<input className={ui.input} disabled={!canManage} value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Homepage headline or section title"/></label><label className={ui.fieldLabel}>Subtitle<input className={ui.input} disabled={!canManage} value={editing.subtitle || ''} onChange={e => setEditing({ ...editing, subtitle: e.target.value })} placeholder="Optional supporting text"/></label><label className={ui.fieldLabel}>Content JSON<textarea className={`${ui.input} contentJsonEditor`} rows={10} disabled={!canManage} value={editing.contentJson} onChange={e => setEditing({ ...editing, contentJson: e.target.value })}/></label><label className="checkboxLine"><input type="checkbox" disabled={!canManage} checked={editing.isActive} onChange={e => setEditing({ ...editing, isActive: e.target.checked })}/> Publish this block</label><div className="modalFooter"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditing(null)} disabled={busy !== null}>{canManage ? 'Cancel' : 'Close'}</button>{canManage && <button className={ui.btn} onClick={() => save(editing)} disabled={busy !== null}>{busy ? 'Saving…' : createOpen ? 'Create block' : 'Save changes'}</button>}</div></div></div>}
  </div>
}
