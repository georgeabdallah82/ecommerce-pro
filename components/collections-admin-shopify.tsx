'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Eye, MoreHorizontal, Plus, Search, Tag, Trash2, XCircle, X } from 'lucide-react'
import styles from './admin-collections.module.css'
import ui from './admin-ui.module.css'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function CollectionsAdminShopify({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState<any[]>(initial || [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const refresh = async () => { setRows(await api('/api/admin/collections')); setSelected([]) }

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify({ name, slug: slug || undefined, description }),
      })
      setShow(false)
      setName('')
      setSlug('')
      setDescription('')
      await refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create collection')
    } finally {
      setBusy(false)
    }
  }

  const deleteCollection = async (collection: { id: string; name: string }) => {
    if (!confirm(`Delete "${collection.name}"? This cannot be undone.`)) return
    setError('')
    try {
      await api(`/api/admin/collections/${collection.id}`, { method: 'DELETE' })
      await refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to delete collection')
    }
  }

  const toggleRow = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  const toggleAll = () => setSelected(current => current.length === filtered.length ? [] : filtered.map((c: any) => c.id))

  const bulk = async (bulkAction: 'ACTIVATE' | 'DEACTIVATE' | 'DELETE') => {
    if (!selected.length) return
    if (bulkAction === 'DELETE' && !confirm(`Delete ${selected.length} collection${selected.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setBulkBusy(true); setError('')
    try {
      await api('/api/admin/collections', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction }) })
      await refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update collections')
    } finally {
      setBulkBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((collection) => {
      const matchesStatus =
        status === 'ALL' ||
        (status === 'ACTIVE' ? collection.isActive : collection.isActive === false)
      const matchesSearch =
        !term || `${collection.name} ${collection.slug}`.toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [rows, q, status])

  const views: Array<[string, string]> = [
    ['ALL', 'All'],
    ['ACTIVE', 'Active'],
    ['INACTIVE', 'Inactive'],
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={ui.muted}>MERCHANDISING</span>
          <h1 className={styles.title}>Collections</h1>
          <p className={ui.muted}>Group products into storefront-ready merchandising destinations.</p>
        </div>
        <button className={`${ui.btn} ${styles.headerBtn}`} onClick={() => setShow(true)}>
          <Plus size={16} /> Create collection
        </button>
      </div>

      {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

      <div className={`${ui.card} ${styles.views}`}>
        {views.map(([value, label]) => (
          <button
            key={value}
            className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`}
            onClick={() => setStatus(value)}
          >
            {label}{' '}
            <span className={ui.muted}>
              {value === 'ALL'
                ? rows.length
                : rows.filter((collection) =>
                    value === 'ACTIVE' ? collection.isActive : collection.isActive === false,
                  ).length}
            </span>
          </button>
        ))}
      </div>

      <div className={`${ui.card} ${styles.toolbar}`}>
        <div className={styles.search}>
          <Search size={16} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search collections"
          />
          {q && (
            <button className={ui.iconBtn} onClick={() => setQ('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <span className={ui.pill}>{filtered.length} shown</span>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {selected.length > 0 && (
        <div className={ui.bulkBar}>
          <div className={ui.bulkCount}><strong>{selected.length}</strong><span> selected</span></div>
          <div className={ui.bulkActions}>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('ACTIVATE')}><CheckCircle2 size={15} /> Activate</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('DEACTIVATE')}><XCircle size={15} /> Deactivate</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('DELETE')}><Trash2 size={15} /> Delete</button>
          </div>
        </div>
      )}

      <div className={`${ui.card} ${styles.tableCard}`}>
        <div className={ui.tableWrap}>
          <table className={`${ui.table} ${styles.resultsTable}`}>
            <thead>
              <tr>
                <th><input type="checkbox" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll} aria-label="Select all collections" /></th>
                <th>Collection</th>
                <th>Products</th>
                <th>Status</th>
                <th>Sales channel</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((collection) => (
                <tr key={collection.id}>
                  <td><input type="checkbox" checked={selected.includes(collection.id)} onChange={() => toggleRow(collection.id)} aria-label={`Select ${collection.name}`} /></td>
                  <td>
                    <div className={styles.cell}>
                      <div className={styles.thumb}>
                        {collection.imageUrl ? (
                          <img src={collection.imageUrl} alt="" />
                        ) : (
                          <Tag size={18} />
                        )}
                      </div>
                      <div>
                        <strong>{collection.name}</strong>
                        <span className={ui.muted}>/{collection.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td>{collection._count?.products ?? 0}</td>
                  <td>
                    <span className={`${ui.statusPill} ${collection.isActive ? ui.statusPillSuccess : ''}`}>
                      {collection.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.channel}>Online Store</span>
                  </td>
                  <td>
                    {collection.updatedAt ? new Date(collection.updatedAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div className="inline">
                      <Link
                        className={ui.iconBtn}
                        href={`/admin/collections/${collection.id}`}
                        title="Edit"
                      >
                        <MoreHorizontal size={16} />
                      </Link>
                      <Link
                        className={ui.iconBtn}
                        href={`/collections/${collection.slug}`}
                        target="_blank"
                        title="Preview"
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        className={ui.iconBtn}
                        title="Delete collection"
                        onClick={() => deleteCollection(collection)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <div className={ui.empty}>No collections match your current filters.</div>}
      </div>

      {show && (
        <div className={ui.modalOverlay} onClick={() => setShow(false)}>
          <form
            className={ui.card}
            style={{ width: 'min(560px,94vw)', padding: 24 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={create}
          >
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}>
              <div>
                <h2 className={styles.modalTitle}>Create collection</h2>
                <p className={ui.muted}>Set the collection identity now; products can be arranged from its editor.</p>
              </div>
              <button type="button" className={ui.iconBtn} onClick={() => setShow(false)} aria-label="Close">
                ×
              </button>
            </div>
            <label className={ui.fieldLabel}>
              Name
              <input className={ui.input} required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className={ui.fieldLabel}>
              Handle
              <input
                className={ui.input}
                placeholder="summer-sale"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
            <label className={ui.fieldLabel}>
              Description
              <textarea
                className={ui.textarea}
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setShow(false)}>
                Cancel
              </button>
              <button className={ui.btn} disabled={busy}>
                {busy ? 'Creating…' : 'Create collection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
