'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, MoreHorizontal, Plus, Search, Tag, X } from 'lucide-react'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

const styles = `
.collectionCatalog{max-width:1280px;margin:0 auto;padding-bottom:24px}
.collectionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}
.collectionTitle{margin:0;font-size:38px;letter-spacing:-.045em}
.collectionViews{display:flex;gap:2px;padding:5px;margin-bottom:12px;overflow:auto}
.collectionView{border:0;background:transparent;border-radius:8px;padding:9px 12px;font:inherit;font-size:13px;font-weight:650;color:#66665f;cursor:pointer;white-space:nowrap}
.collectionView.active{background:#171717;color:#fff}
.collectionToolbar{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:12px}
.collectionSearch{display:flex;align-items:center;gap:8px;flex:1;height:42px;padding:0 11px;border:1px solid #dfdfd8;border-radius:10px}
.collectionSearch input{border:0;outline:0;flex:1;font:inherit}
.collectionTable{overflow:hidden}
.collectionTable table{min-width:850px}
.collectionTable th{background:#fafaf8;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#77776f}
.collectionCell{display:flex;align-items:center;gap:11px;min-width:280px}
.collectionThumb{width:46px;height:46px;border-radius:9px;display:grid;place-items:center;background:#f0f0eb;overflow:hidden}
.collectionThumb img{width:100%;height:100%;object-fit:cover}
.collectionCell strong{font-size:13px}
.collectionCell span{display:block;font-size:11px;margin-top:3px}
.channelPill{display:inline-flex;padding:5px 8px;border:1px solid #deded7;border-radius:7px;font-size:10px}
.collectionTable tbody tr:hover{background:#fcfcfa}
@media(max-width:700px){.collectionHead{flex-direction:column;align-items:stretch}.collectionHead .btn{width:100%;justify-content:center}.collectionTitle{font-size:32px}.collectionViews{width:100%}}
`

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

  return (
    <>
      <style>{styles}</style>
      <div className="collectionCatalog">
        <div className="collectionHead">
          <div>
            <span className="muted">MERCHANDISING</span>
            <h1 className="collectionTitle">Collections</h1>
            <p className="muted">Group products into storefront-ready merchandising destinations.</p>
          </div>
          <button className="btn" onClick={() => setShow(true)}>
            <Plus size={16} /> Create collection
          </button>
        </div>

        {error && <div className="alert danger">{error}</div>}

        <div className="card collectionViews">
          {[
            ['ALL', 'All'],
            ['ACTIVE', 'Active'],
            ['INACTIVE', 'Inactive'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? 'collectionView active' : 'collectionView'}
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

        <div className="card collectionToolbar">
          <div className="collectionSearch">
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

        <div className="card collectionTable">
          <div className="tableWrap">
            <table className="table">
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
                      <div className="collectionCell">
                        <div className="collectionThumb">
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
                      <span className="channelPill">Online Store</span>
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
    </>
  )
}
