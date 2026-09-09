'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, MoreHorizontal, Plus, Search, Tag, X } from 'lucide-react'
import styles from './admin-collections.module.css'

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

  const refresh = async () => setRows(await api('/api/admin/collections'))

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
          <span className="muted">MERCHANDISING</span>
          <h1 className={styles.title}>Collections</h1>
          <p className="muted">Group products into storefront-ready merchandising destinations.</p>
        </div>
        <button className="btn" onClick={() => setShow(true)}>
          <Plus size={16} /> Create collection
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      <div className={`card ${styles.views}`}>
        {views.map(([value, label]) => (
          <button
            key={value}
            className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`}
            onClick={() => setStatus(value)}
          >
            {label}{' '}
            <span className="muted">
              {value === 'ALL'
                ? rows.length
                : rows.filter((collection) =>
                    value === 'ACTIVE' ? collection.isActive : collection.isActive === false,
                  ).length}
            </span>
          </button>
        ))}
      </div>

      <div className={`card ${styles.toolbar}`}>
        <div className={styles.search}>
          <Search size={16} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search collections"
          />
          {q && (
            <button className="iconBtn" onClick={() => setQ('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <span className="pill">{filtered.length} shown</span>
        <button className="btn secondary" onClick={refresh} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className={`card ${styles.tableCard}`}>
        <div className="tableWrap">
          <table className={`table ${styles.resultsTable}`}>
            <thead>
              <tr>
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
                        <span className="muted">/{collection.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td>{collection._count?.products ?? 0}</td>
                  <td>
                    <span className={`statusPill ${collection.isActive ? 'active' : 'archived'}`}>
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
                        className="iconBtn"
                        href={`/admin/collections/${collection.id}`}
                        title="Edit"
                      >
                        <MoreHorizontal size={16} />
                      </Link>
                      <Link
                        className="iconBtn"
                        href={`/collections/${collection.slug}`}
                        target="_blank"
                        title="Preview"
                      >
                        <Eye size={16} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <div className="empty">No collections match your current filters.</div>}
      </div>

      {show && (
        <div className="modalOverlay" onClick={() => setShow(false)}>
          <form
            className="card"
            style={{ width: 'min(560px,94vw)', padding: 24 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={create}
          >
            <div className="sectionHead small">
              <div>
                <h2 className="h3">Create collection</h2>
                <p className="muted">Set the collection identity now; products can be arranged from its editor.</p>
              </div>
              <button type="button" className="iconBtn" onClick={() => setShow(false)} aria-label="Close">
                ×
              </button>
            </div>
            <label className="fieldLabel">
              Name
              <input className="input" required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="fieldLabel">
              Handle
              <input
                className="input"
                placeholder="summer-sale"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              Description
              <textarea
                className="textarea"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="btn secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button className="btn" disabled={busy}>
                {busy ? 'Creating…' : 'Create collection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
