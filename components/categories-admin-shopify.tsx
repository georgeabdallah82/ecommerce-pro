'use client'
import { useMemo, useState } from 'react'
import { ChevronRight, FolderTree, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import styles from './admin-categories.module.css'
import ui from './admin-ui.module.css'

type Category = {
  id: string
  name: string
  slug: string
  description?: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
  _count?: { products: number }
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

const emptyForm = { name: '', slug: '', description: '', parentId: '', sortOrder: 0, isActive: true }

export default function CategoriesAdminShopify({ initial }: { initial: Category[] }) {
  const [rows, setRows] = useState<Category[]>(initial || [])
  const [q, setQ] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = async () => setRows(await api('/api/admin/categories'))

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShow(true) }
  const openEdit = (c: Category) => {
    setEditing(c)
    setForm({ name: c.name, slug: c.slug, description: c.description || '', parentId: c.parentId || '', sortOrder: c.sortOrder, isActive: c.isActive })
    setError('')
    setShow(true)
  }
  const close = () => { if (!busy) { setShow(false); setEditing(null) } }

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const payload = { name: form.name, slug: form.slug || undefined, description: form.description || null, parentId: form.parentId || null, sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive }
      if (editing) await api(`/api/admin/categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      else await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(payload) })
      setShow(false); setEditing(null); setForm(emptyForm)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save category')
    } finally { setBusy(false) }
  }

  const remove = async (c: Category) => {
    const childCount = rows.filter(r => r.parentId === c.id).length
    const parts = [`Delete "${c.name}"?`]
    if (c._count?.products) parts.push(`${c._count.products} product${c._count.products === 1 ? '' : 's'} will be uncategorized.`)
    if (childCount) parts.push(`${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} will move to top level.`)
    if (!confirm(parts.join(' '))) return
    setDeletingId(c.id); setError('')
    try {
      await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete category')
    } finally { setDeletingId(null) }
  }

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter(c => !t || `${c.name} ${c.slug}`.toLowerCase().includes(t))
  }, [rows, q])
  const roots = matches.filter(c => !c.parentId)
  const children = (id: string) => matches.filter(c => c.parentId === id)

  const render = (c: Category, d = 0) => (
    <div key={c.id} className={styles.row}>
      <div className={styles.name} style={{ paddingLeft: d * 28 }}>
        {d > 0 ? <ChevronRight size={14} className={styles.chevron} /> : <FolderTree size={16} className={styles.chevron} />}
        <strong>{c.name}</strong>
        <span className={ui.muted}>/{c.slug}</span>
      </div>
      <div>{c._count?.products ?? 0}</div>
      <div><span className={`${ui.statusPill} ${c.isActive === false ? ui.statusPillWarning : ui.statusPillSuccess}`}>{c.isActive === false ? 'Hidden' : 'Active'}</span></div>
      <div className={styles.rowActions}>
        <button type="button" className={styles.actionBtn} title="Edit" onClick={() => openEdit(c)}><Pencil size={14} /></button>
        <button type="button" className={styles.deleteBtn} title="Delete" disabled={deletingId === c.id} onClick={() => remove(c)}><Trash2 size={14} /></button>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div><span className={ui.muted}>CATALOG</span><h1 className={styles.title}>Categories</h1><p className={ui.muted}>Organize products into a clean hierarchy for merchandising and navigation.</p></div>
        <button className={ui.btn} onClick={openCreate}><Plus size={16} /> Add category</button>
      </div>
      {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
      <div className={`${ui.card} ${styles.toolbar}`}>
        <div className={styles.search}>
          <Search size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search categories" />
          {q && <button className={ui.iconBtn} onClick={() => setQ('')}><X size={14} /></button>}
        </div>
        <span className={ui.pill}>{rows.length} categories</span>
      </div>
      <div className={`${ui.card} ${styles.table}`}>
        <div className={styles.tableHeader}><span>Category</span><span>Products</span><span>Status</span><span></span></div>
        {roots.map(c => [render(c), ...children(c.id).map(x => render(x, 1))])}
        {!matches.length && <div className={ui.empty}>No categories match your search.</div>}
      </div>
      {show && (
        <div className={ui.modalOverlay} onClick={close}>
          <form className={`${ui.card} ${styles.modal}`} onClick={e => e.stopPropagation()} onSubmit={save}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}>
              <div><h2 className={styles.modalTitle}>{editing ? 'Edit category' : 'Add category'}</h2><p className={ui.muted}>{editing ? 'Update this category\'s details.' : 'Create a parent category or place it under an existing one.'}</p></div>
              <button type="button" className={ui.iconBtn} onClick={close}><X size={16} /></button>
            </div>
            <div className={styles.modalGrid}>
              <label className={ui.fieldLabel}>Name<input className={ui.input} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label className={ui.fieldLabel}>Slug<input className={ui.input} placeholder="Generated from name if left blank" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></label>
              <label className={ui.fieldLabel}>Description<textarea className={ui.textarea} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
              <div className={styles.twoCol}>
                <label className={ui.fieldLabel}>Parent<select className={ui.select} value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}>
                  <option value="">Top level</option>
                  {rows.filter(c => !c.parentId && c.id !== editing?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
                <label className={ui.fieldLabel}>Sort order<input className={ui.input} type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} /></label>
              </div>
              <label className={styles.checkboxRow}><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Visible in storefront navigation</label>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={close}>Cancel</button>
              <button className={ui.btn} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create category'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
